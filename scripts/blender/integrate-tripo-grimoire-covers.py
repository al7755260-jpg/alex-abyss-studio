from __future__ import annotations

"""Replace the procedural grimoire shells with two Tripo cover GLBs.

This script is intentionally separate from ``build-abyss-grimoire.py``:

1. The procedural build stays usable while Tripo is still generating.
2. This script refuses to touch the authored blend or published GLB unless both
   source files exist, are valid GLB containers, import successfully, and the
   resulting combined GLB passes a small structural validation.
3. Re-running it is safe.  Previously imported ``Tripo_*Cover`` objects are
   replaced while the page block, spine, inner liners, clasp, three page hinges,
   and their NLA animation remain untouched.

Run it in the same Blender 5.x MCP session used for the authored book.  The
printed JSON contains the measured source/final bounding boxes and the two
orientation decisions that may need a one-line manual override after visually
checking a real Tripo result.
"""

import hashlib
import json
import math
import os
import struct
from pathlib import Path
from typing import Any

import bmesh
import bpy
from mathutils import Matrix, Vector


PROJECT_ROOT = Path(r"C:\Users\A\Documents\Codex\2026-08-27\ni-x\work\cthulhu-studio")
SOURCE_DIR = PROJECT_ROOT / "raw-models" / "blender" / "abyss-grimoire"
BLEND_PATH = SOURCE_DIR / "abyss-grimoire-animated.blend"
GLB_PATH = PROJECT_ROOT / "public" / "models" / "abyss-grimoire-animated.glb"
TEMP_GLB_PATH = GLB_PATH.with_name("abyss-grimoire-animated.tripo-import.tmp.glb")
REPORT_PATH = SOURCE_DIR / "abyss-grimoire-tripo-cover-integration.json"

FRONT_SOURCE_PATH = (
    PROJECT_ROOT
    / "raw-models"
    / "tripo"
    / "abyss-grimoire-front-cover"
    / "source.glb"
)
BACK_SOURCE_PATH = (
    PROJECT_ROOT
    / "raw-models"
    / "tripo"
    / "abyss-grimoire-back-cover"
    / "source.glb"
)

COLLECTION_NAME = "Codex_Abyss_Grimoire"
ROOT_NAME = "GRIMOIRE_ROOT"
TOP_HINGE_NAME = "Top_Cover_Hinge"
CLIP_NAME = "Grimoire_3Click_Cycle"

BOOK_W = 3.60
BOOK_D = 2.55
COVER_T = 0.14
# The book is a 0.78-unit desk prop in the website.  About 90k triangles per
# textured cover preserves the silhouette/eye/tentacle relief while keeping the
# combined cover budget at or below 180k triangles before Meshopt compression.
MAX_TRIANGLES_PER_COVER = 90_000

# Manual orientation controls.  Keep ``source_exterior_sign`` as None for the
# automatic relief-side detector.  If a real Tripo cover renders inside-out,
# change only that cover to +1 or -1, based on ``source_thin_axis`` in the JSON
# report.  If its crest is upside-down, change ``source_up_sign`` to -1.
COVER_SPECS: dict[str, dict[str, Any]] = {
    "front": {
        "source_path": FRONT_SOURCE_PATH,
        "object_prefix": "Tripo_FrontCover",
        "wrapper_name": "Tripo_FrontCover_Assembly",
        "parent_name": TOP_HINGE_NAME,
        # Local coordinates of Top_Cover_Hinge: hinge is at x=0.
        "target_min": (0.0, -BOOK_D * 0.5, -COVER_T * 0.5),
        "target_max": (BOOK_W, BOOK_D * 0.5, 0.19),
        "target_exterior_sign": 1,
        # Measured Tripo front source has almost symmetric depth statistics;
        # visual review proves its green-eye relief is on raw +Z.
        "source_exterior_sign": 1,
        "source_up_sign": 1,
        # The Tripo image reconstruction contains a perspective wedge.  Deskew
        # the rigid shell around its spine pivot so both long edges meet the
        # authored inner liner instead of only the lowest AABB point touching.
        "wrapper_location": (0.0, 0.0, -0.211333),
        "wrapper_rotation_degrees": (-0.016533, -3.505684, 0.000506),
    },
    "back": {
        "source_path": BACK_SOURCE_PATH,
        "object_prefix": "Tripo_BackCover",
        "wrapper_name": "Tripo_BackCover_Assembly",
        "parent_name": ROOT_NAME,
        # The lower relief is allowed below z=0.  The web loader grounds the
        # combined GLB by its measured minimum, so it still rests on the desk.
        "target_min": (-BOOK_W * 0.5, -BOOK_D * 0.5, -0.10),
        "target_max": (BOOK_W * 0.5, BOOK_D * 0.5, COVER_T),
        "target_exterior_sign": -1,
        "source_exterior_sign": None,
        "source_up_sign": 1,
        "wrapper_location": (0.0, 0.0, 0.032210),
        "wrapper_rotation_degrees": (-0.006987, -1.125123, 0.000069),
    },
}

# The imported covers already contain their visible shell, frame, corners, and
# relief.  Inner liners, spine, clasp, page block, and pages are deliberately
# absent from this list and therefore survive the replacement.
PROCEDURAL_EXTERIOR_EXACT = {
    "Bottom_Cover",
    "Top_Cover",
}
PROCEDURAL_EXTERIOR_PREFIXES = (
    "Bottom_Corner_",
    "Top_Frame_",
    "Top_Corner_",
    "Elder_Eye_",
    "Attached_Tentacle_Relief_",
)
TRIPO_PREFIXES = ("Tripo_FrontCover", "Tripo_BackCover")


def require_valid_glb(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(
            f"Tripo cover is not ready: {path}. Both source.glb files are required; "
            "the existing authored blend and published GLB were not touched."
        )
    size = path.stat().st_size
    if size < 1024:
        raise RuntimeError(f"Tripo GLB is unexpectedly small ({size} bytes): {path}")
    with path.open("rb") as handle:
        header = handle.read(12)
    if len(header) != 12 or header[:4] != b"glTF":
        raise RuntimeError(f"Not a binary glTF file: {path}")
    version, declared_size = struct.unpack("<II", header[4:12])
    if version != 2 or declared_size != size:
        raise RuntimeError(
            f"Invalid GLB header for {path}: version={version}, "
            f"declared={declared_size}, actual={size}"
        )
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    return {"path": str(path), "size_bytes": size, "sha256": digest}


def read_glb_json(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        magic, version, total_size = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2 or total_size != path.stat().st_size:
            raise RuntimeError(f"Exported file has an invalid GLB header: {path}")
        chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
        if chunk_type != 0x4E4F534A:
            raise RuntimeError(f"First GLB chunk is not JSON: {path}")
        payload = handle.read(chunk_length).decode("utf-8").rstrip(" \t\r\n\0")
    return json.loads(payload)


def snapshot_ids(collection: Any) -> set[int]:
    return {block.as_pointer() for block in collection}


def remove_named_object(obj: bpy.types.Object) -> None:
    data = obj.data
    owner = None
    if obj.type == "MESH":
        owner = bpy.data.meshes
    elif obj.type == "CURVE":
        owner = bpy.data.curves
    bpy.data.objects.remove(obj, do_unlink=True)
    if data is not None and owner is not None and data.users == 0:
        owner.remove(data)


def remove_previous_tripo_imports(collection: bpy.types.Collection) -> list[str]:
    removed: list[str] = []
    for obj in list(collection.objects):
        if obj.name.startswith(TRIPO_PREFIXES):
            removed.append(obj.name)
            remove_named_object(obj)
    # Imported materials/images can retain a Blender-side reference count of
    # one through their node/image relationship even after their mesh object is
    # gone.  Every prefixed block belongs exclusively to this integration, so
    # explicitly unlink the whole old resource chain before importing again.
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for block in list(datablocks):
            if block.name.startswith(TRIPO_PREFIXES):
                datablocks.remove(block, do_unlink=True)
    return removed


def relink_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def import_glb_objects(
    path: Path,
    role: str,
    collection: bpy.types.Collection,
) -> tuple[list[bpy.types.Object], list[bpy.types.Material], list[bpy.types.Image]]:
    before_objects = snapshot_ids(bpy.data.objects)
    before_materials = snapshot_ids(bpy.data.materials)
    before_images = snapshot_ids(bpy.data.images)
    before_collections = snapshot_ids(bpy.data.collections)

    properties = set(bpy.ops.import_scene.gltf.get_rna_type().properties.keys())
    kwargs: dict[str, Any] = {"filepath": str(path)}
    if "import_pack_images" in properties:
        kwargs["import_pack_images"] = True
    result = bpy.ops.import_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender could not import {path}: {result}")

    imported = [
        obj for obj in bpy.data.objects if obj.as_pointer() not in before_objects
    ]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"Tripo file imported no mesh objects: {path}")
    if any(obj.modifiers for obj in meshes):
        names = [obj.name for obj in meshes if obj.modifiers]
        raise RuntimeError(f"Unexpected modifiers in Tripo meshes: {names}")

    # Bake the full imported node hierarchy into mesh vertices.  This removes
    # arbitrary Tripo root rotations/scales but retains materials, UVs, and all
    # image texture links.  Each primitive then becomes a static child of the
    # book's own animated hinge/root.
    for index, obj in enumerate(meshes, start=1):
        source_name = obj.name
        obj.data = obj.data.copy()
        obj.data.transform(obj.matrix_world)
        obj.data.update()
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.name = f"Tripo_{role.title()}Cover_{index:03d}_{source_name}"[:63]
        obj.data.name = f"Tripo_{role.title()}Cover_Mesh_{index:03d}"[:63]
        relink_only(obj, collection)

    for obj in imported:
        if obj not in meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    materials = [
        block
        for block in bpy.data.materials
        if block.as_pointer() not in before_materials
    ]
    images = [
        block for block in bpy.data.images if block.as_pointer() not in before_images
    ]
    for index, mat in enumerate(materials, start=1):
        mat.name = f"Tripo_{role.title()}Cover_Mat_{index:03d}"[:63]
    for index, image in enumerate(images, start=1):
        image.name = f"Tripo_{role.title()}Cover_Tex_{index:03d}"[:63]
        try:
            if image.source == "FILE" and image.packed_file is None:
                image.pack()
        except RuntimeError:
            # GLB buffer-view images are already internally available even when
            # Blender does not expose them as a traditional packed file.
            pass

    # Remove empty collections made by the importer without touching any
    # pre-existing scene hierarchy.
    for imported_collection in list(bpy.data.collections):
        if imported_collection.as_pointer() in before_collections:
            continue
        if not imported_collection.objects and not imported_collection.children:
            bpy.data.collections.remove(imported_collection)

    return meshes, materials, images


def combined_bbox(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [vertex.co for obj in meshes for vertex in obj.data.vertices]
    if not points:
        raise RuntimeError("Imported cover has no vertices")
    minimum = Vector((
        min(point.x for point in points),
        min(point.y for point in points),
        min(point.z for point in points),
    ))
    maximum = Vector((
        max(point.x for point in points),
        max(point.y for point in points),
        max(point.z for point in points),
    ))
    return minimum, maximum


def weighted_spread(samples: list[tuple[float, float]]) -> tuple[float, float]:
    weight = sum(item[1] for item in samples)
    if weight <= 1.0e-12:
        return 0.0, 0.0
    mean = sum(value * area for value, area in samples) / weight
    variance = sum(area * (value - mean) ** 2 for value, area in samples) / weight
    return math.sqrt(max(variance, 0.0)), weight


def triangle_count(meshes: list[bpy.types.Object]) -> int:
    return sum(
        max(len(polygon.vertices) - 2, 0)
        for obj in meshes
        for polygon in obj.data.polygons
    )


def weld_coincident_vertices(meshes: list[bpy.types.Object]) -> dict[str, Any]:
    reports: list[dict[str, Any]] = []
    for obj in meshes:
        mesh = obj.data
        vertices_before = len(mesh.vertices)
        polygons_before = len(mesh.polygons)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1.0e-7)
        # Tripo exports can include large numbers of orphan edges after node
        # flattening.  They are not rendered and only obstruct simplification.
        loose_edges = [edge for edge in bm.edges if not edge.link_faces]
        if loose_edges:
            bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
        bm.to_mesh(mesh)
        bm.free()
        mesh.validate(clean_customdata=False)
        mesh.update()
        reports.append({
            "object": obj.name,
            "vertices_before": vertices_before,
            "vertices_after": len(mesh.vertices),
            "polygons_before": polygons_before,
            "polygons_after": len(mesh.polygons),
            "uv_layers_after": [layer.name for layer in mesh.uv_layers],
        })
    return {"objects": reports}


def decimate_cover(
    meshes: list[bpy.types.Object],
    target_triangles: int,
) -> dict[str, Any]:
    before = triangle_count(meshes)
    if before <= target_triangles:
        return {
            "target_triangles": target_triangles,
            "triangles_before": before,
            "triangles_after": before,
            "ratio_requested": 1.0,
        }
    pass_reports: list[dict[str, Any]] = []
    for obj in meshes:
        object_before = triangle_count([obj])
        object_target = max(
            int(round(target_triangles * object_before / max(before, 1))), 100
        )
        # Some Tripo meshes reach a topology/UV boundary plateau in one
        # Decimate evaluation.  Re-evaluating the already simplified result
        # reliably crosses that plateau while retaining its texture UV layer.
        for pass_index in range(1, 5):
            current = triangle_count([obj])
            if current <= object_target * 1.02:
                break
            ratio = max(min(object_target / current, 0.98), 0.01)
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new(
                f"Codex_Tripo_Web_Decimate_{pass_index}", "DECIMATE"
            )
            modifier.decimate_type = "COLLAPSE"
            modifier.ratio = ratio
            if hasattr(modifier, "use_collapse_triangulate"):
                modifier.use_collapse_triangulate = True
            result = bpy.ops.object.modifier_apply(modifier=modifier.name)
            if "FINISHED" not in result:
                raise RuntimeError(
                    f"Could not decimate imported Tripo mesh {obj.name}: {result}"
                )
            after_pass = triangle_count([obj])
            pass_reports.append({
                "object": obj.name,
                "pass": pass_index,
                "ratio": round(ratio, 8),
                "triangles_before": current,
                "triangles_after": after_pass,
            })
            if after_pass >= current:
                break
    return {
        "target_triangles": target_triangles,
        "triangles_before": before,
        "triangles_after": triangle_count(meshes),
        "passes": pass_reports,
    }


def detect_exterior_sign(
    meshes: list[bpy.types.Object],
    thin_axis: int,
) -> dict[str, Any]:
    side_samples: dict[int, list[tuple[float, float]]] = {-1: [], 1: []}
    for obj in meshes:
        for polygon in obj.data.polygons:
            normal_component = polygon.normal[thin_axis]
            if abs(normal_component) < 0.20:
                continue
            side = 1 if normal_component > 0 else -1
            # Weight by projected area.  A flat backing plane has almost no
            # coordinate spread; a relief side spans many depths.
            projected_area = polygon.area * abs(normal_component)
            side_samples[side].append((polygon.center[thin_axis], projected_area))

    negative_spread, negative_area = weighted_spread(side_samples[-1])
    positive_spread, positive_area = weighted_spread(side_samples[1])
    spreads = {-1: negative_spread, 1: positive_spread}
    areas = {-1: negative_area, 1: positive_area}
    chosen = 1 if positive_spread >= negative_spread else -1
    larger = max(positive_spread, negative_spread)
    smaller = min(positive_spread, negative_spread)
    confidence_ratio = larger / max(smaller, 1.0e-9)
    return {
        "chosen_source_sign": chosen,
        "confidence_ratio": round(confidence_ratio, 4),
        "spread_by_source_sign": {
            "-1": round(negative_spread, 6),
            "+1": round(positive_spread, 6),
        },
        "projected_area_by_source_sign": {
            "-1": round(negative_area, 6),
            "+1": round(positive_area, 6),
        },
        "needs_visual_confirmation": confidence_ratio < 1.35,
    }


def orientation_matrix(
    long_axis: int,
    middle_axis: int,
    thin_axis: int,
    *,
    source_exterior_sign: int,
    target_exterior_sign: int,
    source_up_sign: int,
) -> tuple[Matrix, dict[str, int]]:
    signs = {
        "x": 1,
        "y": 1 if source_up_sign >= 0 else -1,
        "z": target_exterior_sign * source_exterior_sign,
    }

    def build() -> Matrix:
        rows: list[list[float]] = []
        for source_axis, sign in (
            (long_axis, signs["x"]),
            (middle_axis, signs["y"]),
            (thin_axis, signs["z"]),
        ):
            row = [0.0, 0.0, 0.0]
            row[source_axis] = float(sign)
            rows.append(row)
        return Matrix(rows)

    matrix = build()
    if matrix.determinant() < 0:
        # Preserve polygon winding/normals.  Horizontal mirroring is visually
        # harmless for the symmetrical cover brief and keeps the chosen up and
        # exterior directions intact.
        signs["x"] *= -1
        matrix = build()
    return matrix, signs


def normalize_cover(
    role: str,
    meshes: list[bpy.types.Object],
    spec: dict[str, Any],
    collection: bpy.types.Collection,
) -> dict[str, Any]:
    raw_min, raw_max = combined_bbox(meshes)
    raw_dimensions = raw_max - raw_min
    source_axes = sorted(range(3), key=lambda axis: raw_dimensions[axis], reverse=True)
    long_axis, middle_axis, thin_axis = source_axes
    if raw_dimensions[middle_axis] <= 1.0e-6 or raw_dimensions[thin_axis] <= 1.0e-6:
        raise RuntimeError(f"Degenerate Tripo cover bounds for {role}: {raw_dimensions[:]}")
    if raw_dimensions[long_axis] / raw_dimensions[middle_axis] < 1.08:
        raise RuntimeError(
            f"Cannot distinguish cover width/depth axes for {role}: {raw_dimensions[:]}"
        )
    # Single-image Tripo covers often include deep tentacle/medallion relief,
    # so their unprocessed middle/thin ratio can be as low as ~1.5.  Reject only
    # genuinely non-slab results; the exact target bbox below compresses excess
    # relief depth into the collision-safe authored envelope.
    if raw_dimensions[middle_axis] / raw_dimensions[thin_axis] < 1.15:
        raise RuntimeError(
            f"Tripo result is not cover-like (middle/thin ratio < 1.15) for {role}: "
            f"{raw_dimensions[:]}"
        )

    positional_weld = weld_coincident_vertices(meshes)
    decimation = decimate_cover(meshes, MAX_TRIANGLES_PER_COVER)

    exterior_detection = detect_exterior_sign(meshes, thin_axis)
    exterior_override = spec["source_exterior_sign"]
    source_exterior_sign = (
        int(exterior_override)
        if exterior_override in (-1, 1)
        else int(exterior_detection["chosen_source_sign"])
    )
    orient, chosen_signs = orientation_matrix(
        long_axis,
        middle_axis,
        thin_axis,
        source_exterior_sign=source_exterior_sign,
        target_exterior_sign=int(spec["target_exterior_sign"]),
        source_up_sign=int(spec["source_up_sign"]),
    )

    target_min = Vector(spec["target_min"])
    target_max = Vector(spec["target_max"])
    target_dimensions = target_max - target_min
    source_dimensions_in_target_order = Vector((
        raw_dimensions[long_axis],
        raw_dimensions[middle_axis],
        raw_dimensions[thin_axis],
    ))
    scales = Vector((
        target_dimensions.x / source_dimensions_in_target_order.x,
        target_dimensions.y / source_dimensions_in_target_order.y,
        target_dimensions.z / source_dimensions_in_target_order.z,
    ))
    raw_center = (raw_min + raw_max) * 0.5
    target_center = (target_min + target_max) * 0.5
    scale_matrix = Matrix.Diagonal((scales.x, scales.y, scales.z, 1.0))
    transform = (
        Matrix.Translation(target_center)
        @ scale_matrix
        @ orient.to_4x4()
        @ Matrix.Translation(-raw_center)
    )
    for obj in meshes:
        obj.data.transform(transform)
        obj.data.update()

    wrapper = bpy.data.objects.new(spec["wrapper_name"], None)
    collection.objects.link(wrapper)
    wrapper.empty_display_type = "PLAIN_AXES"
    wrapper.empty_display_size = 0.16
    wrapper.parent = bpy.data.objects[spec["parent_name"]]
    wrapper.matrix_parent_inverse = Matrix.Identity(4)
    wrapper.matrix_basis = Matrix.Identity(4)
    wrapper.location = Vector(spec.get("wrapper_location", (0.0, 0.0, 0.0)))
    wrapper.rotation_euler = tuple(
        math.radians(value)
        for value in spec.get("wrapper_rotation_degrees", (0.0, 0.0, 0.0))
    )
    wrapper["source"] = "Tripo"
    wrapper["source_glb"] = str(spec["source_path"])
    wrapper["role"] = role
    for obj in meshes:
        obj.parent = wrapper
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)

    final_min, final_max = combined_bbox(meshes)
    axis_names = ("X", "Y", "Z")
    return {
        "source_axis_mapping": {
            "target_x_long": axis_names[long_axis],
            "target_y_up": axis_names[middle_axis],
            "target_z_thin": axis_names[thin_axis],
        },
        "raw_bbox": {
            "min": [round(value, 6) for value in raw_min],
            "max": [round(value, 6) for value in raw_max],
            "dimensions": [round(value, 6) for value in raw_dimensions],
        },
        "target_bbox": {
            "min": [round(value, 6) for value in target_min],
            "max": [round(value, 6) for value in target_max],
            "dimensions": [round(value, 6) for value in target_dimensions],
        },
        "measured_final_bbox": {
            "min": [round(value, 6) for value in final_min],
            "max": [round(value, 6) for value in final_max],
            "dimensions": [round(value, 6) for value in final_max - final_min],
        },
        "nonuniform_scale": [round(value, 7) for value in scales],
        "positional_weld": positional_weld,
        "decimation": decimation,
        "orientation_signs": chosen_signs,
        "source_exterior_sign_used": source_exterior_sign,
        "source_exterior_sign_override": exterior_override,
        "source_up_sign_used": int(spec["source_up_sign"]),
        "exterior_detection": exterior_detection,
        "wrapper": wrapper.name,
        "parent": wrapper.parent.name,
        "wrapper_correction": {
            "location": [round(value, 6) for value in wrapper.location],
            "rotation_degrees": [
                round(math.degrees(value), 6) for value in wrapper.rotation_euler
            ],
        },
        "mesh_objects": [obj.name for obj in meshes],
    }


def remove_procedural_exteriors(collection: bpy.types.Collection) -> list[str]:
    removed: list[str] = []
    for obj in list(collection.objects):
        if (
            obj.name in PROCEDURAL_EXTERIOR_EXACT
            or obj.name.startswith(PROCEDURAL_EXTERIOR_PREFIXES)
        ):
            removed.append(obj.name)
            remove_named_object(obj)
    return removed


def nla_track_names(obj: bpy.types.Object) -> list[str]:
    animation_data = obj.animation_data
    if animation_data is None:
        return []
    return [track.name for track in animation_data.nla_tracks]


def export_selected_collection(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    output_path: Path,
) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs: dict[str, Any] = {
        "filepath": str(output_path),
        "export_format": "GLB",
        "use_selection": True,
        "export_animations": True,
        "export_frame_range": True,
        "export_force_sampling": True,
        "export_extras": True,
        "export_materials": "EXPORT",
        "export_yup": True,
    }
    if "export_animation_mode" in properties:
        kwargs["export_animation_mode"] = "NLA_TRACKS"
    elif "export_nla_strips" in properties:
        kwargs["export_nla_strips"] = True
    if "export_apply" in properties:
        kwargs["export_apply"] = True
    if "export_image_format" in properties:
        kwargs["export_image_format"] = "AUTO"
    if "export_nla_strips_merged_animation_name" in properties:
        kwargs["export_nla_strips_merged_animation_name"] = CLIP_NAME
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError(f"Combined grimoire GLB export failed: {result}")


def main() -> dict[str, Any]:
    # Validate all prerequisites before opening or mutating Blender data.
    sources = {
        role: require_valid_glb(Path(spec["source_path"]))
        for role, spec in COVER_SPECS.items()
    }
    if not BLEND_PATH.is_file():
        raise FileNotFoundError(
            f"Authored grimoire blend is missing: {BLEND_PATH}. Run "
            "build-abyss-grimoire.py first."
        )

    current_path = Path(bpy.data.filepath) if bpy.data.filepath else None
    if current_path is None or current_path.resolve() != BLEND_PATH.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))

    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    collection = bpy.data.collections.get(COLLECTION_NAME)
    root = bpy.data.objects.get(ROOT_NAME)
    top_hinge = bpy.data.objects.get(TOP_HINGE_NAME)
    if collection is None or root is None or top_hinge is None:
        raise RuntimeError(
            f"The authored blend lacks {COLLECTION_NAME}, {ROOT_NAME}, or {TOP_HINGE_NAME}"
        )
    if CLIP_NAME not in nla_track_names(top_hinge):
        raise RuntimeError(f"Top cover animation track is missing: {CLIP_NAME}")

    removed_previous = remove_previous_tripo_imports(collection)
    integration: dict[str, Any] = {}
    material_names: list[str] = []
    image_names: list[str] = []
    for role, spec in COVER_SPECS.items():
        meshes, materials, images = import_glb_objects(
            Path(spec["source_path"]), role, collection
        )
        integration[role] = normalize_cover(role, meshes, spec, collection)
        integration[role]["materials"] = [mat.name for mat in materials]
        integration[role]["images"] = [image.name for image in images]
        material_names.extend(mat.name for mat in materials)
        image_names.extend(image.name for image in images)

    removed_procedural = remove_procedural_exteriors(collection)
    # These four structural objects are the intentional hybrid seam between
    # Tripo's detailed exterior and Blender's collision-safe animation rig.
    required_survivors = (
        "Bottom_Cover_InnerPanel",
        "Top_Cover_InnerPanel",
        "Spine",
        "Page_Block",
        "Page_01_Hinge",
        "Page_02_Hinge",
        "Page_03_Hinge",
    )
    missing_survivors = [name for name in required_survivors if bpy.data.objects.get(name) is None]
    if missing_survivors:
        raise RuntimeError(f"Integration removed required rig objects: {missing_survivors}")

    root["cover_source"] = "Tripo front+back GLB"
    root["front_cover_source_glb"] = str(FRONT_SOURCE_PATH)
    root["back_cover_source_glb"] = str(BACK_SOURCE_PATH)
    root["cover_integration_report"] = str(REPORT_PATH)

    if TEMP_GLB_PATH.exists():
        TEMP_GLB_PATH.unlink()
    export_selected_collection(collection, root, TEMP_GLB_PATH)
    glb_json = read_glb_json(TEMP_GLB_PATH)
    animation_names = [item.get("name", "") for item in glb_json.get("animations", [])]
    if CLIP_NAME not in animation_names:
        raise RuntimeError(
            f"Temporary export lost {CLIP_NAME}; found animations={animation_names}"
        )
    embedded_image_count = sum(
        1 for item in glb_json.get("images", []) if "bufferView" in item
    )
    if image_names and embedded_image_count == 0:
        raise RuntimeError(
            "Tripo textures were imported but the combined GLB contains no embedded images"
        )
    os.replace(TEMP_GLB_PATH, GLB_PATH)

    report = {
        "status": "integrated",
        "cover_source": "Tripo",
        "sources": sources,
        "blend_path": str(BLEND_PATH),
        "glb_path": str(GLB_PATH),
        "glb_size_bytes": GLB_PATH.stat().st_size,
        "collection": COLLECTION_NAME,
        "clip": CLIP_NAME,
        "clip_duration_seconds": round(
            (scene.frame_end - scene.frame_start) / scene.render.fps, 6
        ),
        "removed_previous_tripo_objects": removed_previous,
        "removed_procedural_exterior_objects": removed_procedural,
        "preserved_rig_objects": list(required_survivors),
        "integrated_materials": material_names,
        "integrated_images": image_names,
        "export": {
            "animations": animation_names,
            "materials": len(glb_json.get("materials", [])),
            "textures": len(glb_json.get("textures", [])),
            "images": len(glb_json.get("images", [])),
            "embedded_images": embedded_image_count,
            "meshes": len(glb_json.get("meshes", [])),
            "nodes": len(glb_json.get("nodes", [])),
        },
        "covers": integration,
        "manual_review": {
            "front": (
                "If the eye/relief faces inward, set front source_exterior_sign to the "
                "opposite sign. If the crest is upside-down, set source_up_sign=-1."
            ),
            "back": (
                "If the seal faces upward into the pages, set back source_exterior_sign "
                "to the opposite sign. If it is upside-down, set source_up_sign=-1."
            ),
            "clearance": (
                "Re-render frames 1, 18, 31, 46, 50-78, 79-107, 108-136, "
                "136-166, and 181. If a Tripo relief exceeds the normalized target, "
                "adjust only that cover's target_min/target_max z values."
            ),
        },
    }
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    print(json.dumps(report, ensure_ascii=False))
    return report


main()

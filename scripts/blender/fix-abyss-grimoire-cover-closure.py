from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(r"C:\Users\A\Documents\Codex\2026-08-27\ni-x\work\cthulhu-studio")
SOURCE_DIR = PROJECT_ROOT / "raw-models" / "blender" / "abyss-grimoire"
BLEND_PATH = SOURCE_DIR / "abyss-grimoire-animated.blend"
UNOPTIMIZED_GLB_PATH = SOURCE_DIR / "abyss-grimoire-closure-unoptimized.glb"
REPORT_PATH = SOURCE_DIR / "abyss-grimoire-cover-closure.json"

COLLECTION_NAME = "Codex_Abyss_Grimoire"
ROOT_NAME = "GRIMOIRE_ROOT"
CLIP_NAME = "Grimoire_3Click_Cycle"

TOP_HINGE_Z = 0.804
FRONT_LOCATION = (0.0, 0.0, -0.211333)
FRONT_ROTATION_DEGREES = (-0.016533, -3.505684, 0.000506)
BACK_LOCATION = (0.0, 0.0, 0.032210)
BACK_ROTATION_DEGREES = (-0.006987, -1.125123, 0.000069)
INNER_LIP_NAME = "Top_Cover_InnerLip"
INNER_BAFFLES_NAME = "Top_Cover_InnerBaffles"
INNER_LIP_OUTER_BOUNDS = (-1.67, 1.77, -1.255, 1.255)
INNER_LIP_INNER_BOUNDS = (-1.67, 1.73, -1.165, 1.165)
INNER_LIP_HEIGHT = 0.084
INNER_LIP_LOCATION = (1.8, 0.0, -0.113)
INNER_BAFFLE_HEIGHT = 0.142
INNER_BAFFLE_LOCATION = (1.8, 0.0, -0.142)


def rounded(values):
    return [round(float(value), 6) for value in values]


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result: list[bpy.types.Object] = []
    pending = list(root.children)
    while pending:
        obj = pending.pop()
        result.append(obj)
        pending.extend(obj.children)
    return result


def evaluated_bounds(obj: bpy.types.Object, depsgraph) -> tuple[Vector, Vector]:
    evaluated = obj.evaluated_get(depsgraph)
    if evaluated.type != "MESH":
        raise RuntimeError(f"Cannot measure non-mesh object: {obj.name}")
    mesh = evaluated.to_mesh()
    try:
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError(f"Cannot measure empty mesh object: {obj.name}")
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def union_bounds(objects: list[bpy.types.Object], depsgraph) -> tuple[Vector, Vector]:
    mesh_objects = [obj for obj in objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("Expected at least one mesh object for bounds measurement")
    bounds = [evaluated_bounds(obj, depsgraph) for obj in mesh_objects]
    return (
        Vector(tuple(min(item[0][axis] for item in bounds) for axis in range(3))),
        Vector(tuple(max(item[1][axis] for item in bounds) for axis in range(3))),
    )


def ensure_inner_lip(
    collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    outer_min_x, outer_max_x, outer_min_y, outer_max_y = INNER_LIP_OUTER_BOUNDS
    inner_min_x, inner_max_x, inner_min_y, inner_max_y = INNER_LIP_INNER_BOUNDS
    half_height = INNER_LIP_HEIGHT * 0.5
    outline = (
        (outer_min_x, outer_min_y),
        (outer_max_x, outer_min_y),
        (outer_max_x, outer_max_y),
        (outer_min_x, outer_max_y),
        (inner_min_x, inner_max_y),
        (inner_max_x, inner_max_y),
        (inner_max_x, inner_min_y),
        (inner_min_x, inner_min_y),
    )
    vertices = [
        (x, y, z)
        for z in (-half_height, half_height)
        for x, y in outline
    ]
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    for index in range(8):
        next_index = (index + 1) % 8
        faces.append((index, next_index, 8 + next_index, 8 + index))

    mesh = bpy.data.meshes.new(f"{INNER_LIP_NAME}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    lip = bpy.data.objects.get(INNER_LIP_NAME)
    if lip is None:
        lip = bpy.data.objects.new(INNER_LIP_NAME, mesh)
        collection.objects.link(lip)
    else:
        if lip.type != "MESH":
            raise RuntimeError(f"Unexpected non-mesh object named {INNER_LIP_NAME}")
        old_mesh = lip.data
        lip.data = mesh
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
        for modifier in list(lip.modifiers):
            lip.modifiers.remove(modifier)
        if lip.name not in collection.objects:
            collection.objects.link(lip)

    lip.parent = parent
    lip.location = INNER_LIP_LOCATION
    lip.rotation_euler = (0.0, 0.0, 0.0)
    lip.scale = (1.0, 1.0, 1.0)
    lip.data.materials.clear()
    material = bpy.data.materials.get("Codex_Grimoire_InnerLeather")
    if material is None:
        raise RuntimeError("Expected inner-leather material is missing")
    lip.data.materials.append(material)
    bevel = lip.modifiers.new("Codex_Rounded_Edges", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 3
    lip["purpose"] = "U-shaped Tripo cover underside lip, open at the fixed spine"
    return lip


def ensure_inner_baffles(
    collection: bpy.types.Collection,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    half_height = INNER_BAFFLE_HEIGHT * 0.5
    min_x = INNER_LIP_OUTER_BOUNDS[0]
    # Carry both perpendicular baffles 0.01 unit into the U-shaped inner lip.
    # The overlap removes raster-scale corner pinholes while keeping every
    # visible face inside the Tripo cover overhang.
    max_x = INNER_LIP_INNER_BOUNDS[1] + 0.01
    baffle_y = 1.1559586
    baffle_x = 1.7209586
    right_baffle_half_y = INNER_LIP_INNER_BOUNDS[3] + 0.01
    corner_patch_x = 1.745
    corner_patch_y_min = 1.08
    corner_patch_y_max = 1.12
    corner_patch_z_min = -0.092
    corner_patch_z_max = -0.003
    vertices = [
        (min_x, -baffle_y, -half_height),
        (max_x, -baffle_y, -half_height),
        (max_x, -baffle_y, half_height),
        (min_x, -baffle_y, half_height),
        (max_x, baffle_y, -half_height),
        (min_x, baffle_y, -half_height),
        (min_x, baffle_y, half_height),
        (max_x, baffle_y, half_height),
        (baffle_x, -right_baffle_half_y, -half_height),
        (baffle_x, right_baffle_half_y, -half_height),
        (baffle_x, right_baffle_half_y, half_height),
        (baffle_x, -right_baffle_half_y, half_height),
        # Two tiny corner patches sit farther out than the page block and tuck
        # into the U-shaped lip. They close oblique-view pinholes from either
        # orbit direction without lowering the animated cover rim onto paper.
        (corner_patch_x, corner_patch_y_min, corner_patch_z_min),
        (corner_patch_x, corner_patch_y_max, corner_patch_z_min),
        (corner_patch_x, corner_patch_y_max, corner_patch_z_max),
        (corner_patch_x, corner_patch_y_min, corner_patch_z_max),
        (corner_patch_x, -corner_patch_y_max, corner_patch_z_min),
        (corner_patch_x, -corner_patch_y_min, corner_patch_z_min),
        (corner_patch_x, -corner_patch_y_min, corner_patch_z_max),
        (corner_patch_x, -corner_patch_y_max, corner_patch_z_max),
    ]
    mesh = bpy.data.meshes.new(f"{INNER_BAFFLES_NAME}_Mesh")
    mesh.from_pydata(
        vertices,
        [],
        [
            (0, 1, 2, 3),
            (4, 5, 6, 7),
            (8, 9, 10, 11),
            (12, 13, 14, 15),
            (16, 17, 18, 19),
        ],
    )
    mesh.update()

    baffles = bpy.data.objects.get(INNER_BAFFLES_NAME)
    if baffles is None:
        baffles = bpy.data.objects.new(INNER_BAFFLES_NAME, mesh)
        collection.objects.link(baffles)
    else:
        if baffles.type != "MESH":
            raise RuntimeError(
                f"Unexpected non-mesh object named {INNER_BAFFLES_NAME}"
            )
        old_mesh = baffles.data
        baffles.data = mesh
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
        for modifier in list(baffles.modifiers):
            baffles.modifiers.remove(modifier)
        if baffles.name not in collection.objects:
            collection.objects.link(baffles)

    baffles.parent = parent
    baffles.location = INNER_BAFFLE_LOCATION
    baffles.rotation_euler = (0.0, 0.0, 0.0)
    baffles.scale = (1.0, 1.0, 1.0)
    baffles.data.materials.clear()
    material = bpy.data.materials.get("Codex_Grimoire_InnerLeather")
    if material is None:
        raise RuntimeError("Expected inner-leather material is missing")
    baffles.data.materials.append(material)
    baffles["purpose"] = "Occlude the safe page-to-lip slot without touching paper"
    return baffles


def export_collection(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    output_path: Path,
) -> None:
    selected_before = list(bpy.context.selected_objects)
    active_before = bpy.context.view_layer.objects.active
    try:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in collection.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root

        properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
        kwargs = {
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
            raise RuntimeError(f"Grimoire GLB export failed: {result}")
    finally:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in selected_before:
            if obj.name in bpy.data.objects:
                obj.select_set(True)
        if active_before is not None and active_before.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = active_before


if not bpy.data.filepath:
    raise RuntimeError("The open Blender file has not been saved")
if Path(bpy.data.filepath).resolve() != BLEND_PATH.resolve():
    raise RuntimeError(
        f"Refusing to modify an unrelated Blender file: {bpy.data.filepath}"
    )

scene = bpy.context.scene
collection = bpy.data.collections.get(COLLECTION_NAME)
root = bpy.data.objects.get(ROOT_NAME)
top_hinge = bpy.data.objects.get("Top_Cover_Hinge")
front_wrapper = bpy.data.objects.get("Tripo_FrontCover_Assembly")
back_wrapper = bpy.data.objects.get("Tripo_BackCover_Assembly")
top_inner = bpy.data.objects.get("Top_Cover_InnerPanel")
page_hinges = [bpy.data.objects.get(f"Page_{index:02d}_Hinge") for index in range(1, 4)]

required = [collection, root, top_hinge, front_wrapper, back_wrapper, top_inner, *page_hinges]
if any(item is None for item in required):
    raise RuntimeError("The live file is missing part of the expected grimoire rig")
if front_wrapper.parent is not top_hinge or back_wrapper.parent is not root:
    raise RuntimeError("Unexpected Tripo cover parent hierarchy")

top_hinge.location.z = TOP_HINGE_Z
front_wrapper.location = FRONT_LOCATION
front_wrapper.rotation_euler = tuple(math.radians(value) for value in FRONT_ROTATION_DEGREES)
back_wrapper.location = BACK_LOCATION
back_wrapper.rotation_euler = tuple(math.radians(value) for value in BACK_ROTATION_DEGREES)
inner_lip = ensure_inner_lip(collection, top_hinge)
inner_baffles = ensure_inner_baffles(collection, top_hinge)

scene.frame_set(1)
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
depsgraph.update()

front_min, front_max = union_bounds(descendants(front_wrapper), depsgraph)
back_min, back_max = union_bounds(descendants(back_wrapper), depsgraph)
inner_min, inner_max = evaluated_bounds(top_inner, depsgraph)
lip_min, lip_max = evaluated_bounds(inner_lip, depsgraph)
baffles_min, baffles_max = evaluated_bounds(inner_baffles, depsgraph)
page_objects: list[bpy.types.Object] = []
for page_hinge in page_hinges:
    page_objects.extend(descendants(page_hinge))
pages_min, pages_max = union_bounds(page_objects, depsgraph)
ink_clearance = inner_min.z - pages_max.z
if not 0.0015 <= ink_clearance <= 0.006:
    raise RuntimeError(
        f"Unsafe closed-page clearance after correction: {ink_clearance:.6f}"
    )

root["cover_closure_fix"] = "Tripo perspective wedge deskew"
root["top_hinge_z"] = TOP_HINGE_Z
root["front_cover_wrapper_location"] = FRONT_LOCATION
root["front_cover_wrapper_rotation_degrees"] = FRONT_ROTATION_DEGREES
root["back_cover_wrapper_location"] = BACK_LOCATION
root["back_cover_wrapper_rotation_degrees"] = BACK_ROTATION_DEGREES
root["top_cover_inner_lip"] = INNER_LIP_NAME
root["top_cover_inner_baffles"] = INNER_BAFFLES_NAME

export_collection(collection, root, UNOPTIMIZED_GLB_PATH)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

report = {
    "status": "corrected",
    "blend_path": str(BLEND_PATH),
    "unoptimized_glb_path": str(UNOPTIMIZED_GLB_PATH),
    "frame": scene.frame_current,
    "top_hinge_z": TOP_HINGE_Z,
    "front_wrapper": {
        "location": rounded(front_wrapper.location),
        "rotation_degrees": rounded(
            math.degrees(value) for value in front_wrapper.rotation_euler
        ),
        "world_bounds": {"min": rounded(front_min), "max": rounded(front_max)},
    },
    "back_wrapper": {
        "location": rounded(back_wrapper.location),
        "rotation_degrees": rounded(
            math.degrees(value) for value in back_wrapper.rotation_euler
        ),
        "world_bounds": {"min": rounded(back_min), "max": rounded(back_max)},
    },
    "top_inner_panel_bounds": {"min": rounded(inner_min), "max": rounded(inner_max)},
    "top_inner_lip": {
        "shape": "U-shaped, open at spine",
        "outer_bounds_xy": rounded(INNER_LIP_OUTER_BOUNDS),
        "inner_bounds_xy": rounded(INNER_LIP_INNER_BOUNDS),
        "height": INNER_LIP_HEIGHT,
        "location": rounded(inner_lip.location),
        "world_bounds": {"min": rounded(lip_min), "max": rounded(lip_max)},
    },
    "top_inner_baffles": {
        "location": rounded(inner_baffles.location),
        "height": INNER_BAFFLE_HEIGHT,
        "world_bounds": {
            "min": rounded(baffles_min),
            "max": rounded(baffles_max),
        },
        "front_back_baffle_abs_y": 1.1559586,
        "fore_edge_baffle_x": 1.7209586,
        "corner_overlap": 0.01,
        "symmetric_corner_patches": {
            "x": 1.745,
            "abs_y": [1.08, 1.12],
            "world_z": [0.57, 0.659],
        },
        "collision_threshold_margin": 0.0005,
    },
    "loose_pages_bounds": {"min": rounded(pages_min), "max": rounded(pages_max)},
    "inner_panel_to_highest_page_or_ink": round(ink_clearance, 6),
}
REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
report

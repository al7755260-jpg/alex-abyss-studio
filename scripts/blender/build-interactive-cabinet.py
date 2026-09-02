from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Callable

import bmesh
import bpy
from mathutils import Matrix, Vector


PROJECT = Path(r"C:\Users\A\Documents\Codex\2026-08-27\ni-x\work\cthulhu-studio")
SOURCE_GLB = PROJECT / "raw-models" / "cabinet.glb"
ASSET_DIR = PROJECT / "raw-models" / "blender" / "maw-cabinet"
BLEND_PATH = ASSET_DIR / "maw-cabinet-animated.blend"
GLB_PATH = ASSET_DIR / "maw-cabinet-animated-unoptimized.glb"
EVIDENCE_DIR = Path(r"C:\Users\A\Documents\Codex\2026-09-02\wo-x\outputs")

COLLECTION_NAME = "Maw_Cabinet_Interactive"
ROOT_NAME = "Cabinet_Root"
BODY_NAME = "Cabinet_Body"
LEFT_HINGE_NAME = "Cabinet_Door_L_Hinge"
RIGHT_HINGE_NAME = "Cabinet_Door_R_Hinge"
LEFT_SURFACE_NAME = "Cabinet_Door_L_Surface"
RIGHT_SURFACE_NAME = "Cabinet_Door_R_Surface"
CLIP_NAME = "CabinetDoorOpen"

FPS = 30
FRAME_CLOSED = 1
FRAME_OPEN = 40
OPEN_ANGLE_DEGREES = 95.0

# Blender-space bounds measured from the existing accepted cabinet.  X points
# out through the front, Y spans left/right, and Z is vertical.
DOOR_X_MIN = 0.105
DOOR_Y_MAX = 0.39
DOOR_Z_MIN = -0.365
DOOR_Z_MAX = 0.365
EPSILON = 1.0e-5


def require_source() -> None:
    if not SOURCE_GLB.is_file() or SOURCE_GLB.stat().st_size < 12:
        raise FileNotFoundError(f"Cabinet source GLB is missing or invalid: {SOURCE_GLB}")
    with SOURCE_GLB.open("rb") as handle:
        if handle.read(4) != b"glTF":
            raise RuntimeError(f"Cabinet source is not a binary glTF: {SOURCE_GLB}")


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in tuple(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def make_principled_material(
    name: str,
    base_color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base_color
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError(f"Material {name} has no Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def bisect_door_boundaries(mesh: bpy.types.Mesh) -> None:
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        planes = (
            ((DOOR_X_MIN, 0.0, 0.0), (1.0, 0.0, 0.0)),
            ((0.0, -DOOR_Y_MAX, 0.0), (0.0, 1.0, 0.0)),
            ((0.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
            ((0.0, DOOR_Y_MAX, 0.0), (0.0, 1.0, 0.0)),
            ((0.0, 0.0, DOOR_Z_MIN), (0.0, 0.0, 1.0)),
            ((0.0, 0.0, DOOR_Z_MAX), (0.0, 0.0, 1.0)),
        )
        for plane_co, plane_no in planes:
            geometry = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(
                bm,
                geom=geometry,
                dist=EPSILON,
                plane_co=Vector(plane_co),
                plane_no=Vector(plane_no),
                use_snap_center=False,
                clear_inner=False,
                clear_outer=False,
            )
        bm.normal_update()
        bm.to_mesh(mesh)
        mesh.update()
    finally:
        bm.free()


def is_door_region(point: Vector) -> bool:
    return (
        point.x >= DOOR_X_MIN - EPSILON
        and abs(point.y) <= DOOR_Y_MAX + EPSILON
        and DOOR_Z_MIN - EPSILON <= point.z <= DOOR_Z_MAX + EPSILON
    )


def filtered_mesh(
    segmented: bpy.types.Mesh,
    name: str,
    keep_face: Callable[[Vector], bool],
) -> bpy.types.Mesh:
    mesh = segmented.copy()
    mesh.name = name
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        to_delete = [face for face in bm.faces if not keep_face(face.calc_center_median())]
        if to_delete:
            bmesh.ops.delete(bm, geom=to_delete, context="FACES")
        loose_vertices = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose_vertices:
            bmesh.ops.delete(bm, geom=loose_vertices, context="VERTS")
        bm.normal_update()
        bm.to_mesh(mesh)
        mesh.update()
    finally:
        bm.free()
    return mesh


def make_box(
    collection: bpy.types.Collection,
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    bevel: float = 0.0,
) -> bpy.types.Object:
    cx, cy, cz = center
    sx, sy, sz = (axis * 0.5 for axis in size)
    vertices = [
        (cx - sx, cy - sy, cz - sz),
        (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz),
        (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz),
        (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz),
        (cx - sx, cy + sy, cz + sz),
    ]
    faces = [
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Softened cabinet edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
    return obj


def parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    if obj.type != "MESH":
        raise TypeError(f"parent_keep_world expects a mesh object, got {obj.type}")
    # Bake the current world-space geometry into hinge-local coordinates.  This
    # avoids matrix_parent_inverse ambiguity in Blender/glTF and gives the web
    # runtime a simple identity child transform beneath each animated hinge.
    bpy.context.view_layer.update()
    obj.data.transform(parent.matrix_world.inverted() @ obj.matrix_world)
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = Matrix.Identity(4)


def action_curves(action: bpy.types.Action) -> list[Any]:
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves: list[Any] = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def animate_hinge(hinge: bpy.types.Object, open_degrees: float) -> str:
    hinge.rotation_mode = "XYZ"
    hinge.rotation_euler = (0.0, 0.0, 0.0)
    hinge.keyframe_insert(data_path="rotation_euler", frame=FRAME_CLOSED, group="Cabinet Door")
    hinge.rotation_euler.z = math.radians(open_degrees)
    hinge.keyframe_insert(data_path="rotation_euler", frame=FRAME_OPEN, group="Cabinet Door")
    animation_data = hinge.animation_data
    if animation_data is None or animation_data.action is None:
        raise RuntimeError(f"{hinge.name} did not receive an animation action")
    action = animation_data.action
    action.name = f"{CLIP_NAME}__{hinge.name}"
    for curve in action_curves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
    track = animation_data.nla_tracks.new()
    track.name = CLIP_NAME
    strip = track.strips.new(CLIP_NAME, FRAME_CLOSED, action)
    strip.name = CLIP_NAME
    strip.extrapolation = "NOTHING"
    animation_data.action = None
    hinge.rotation_euler = (0.0, 0.0, 0.0)
    return action.name


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def world_mesh_bounds(obj: bpy.types.Object) -> dict[str, list[float]]:
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "min": [round(min(point[axis] for point in points), 5) for axis in range(3)],
        "max": [round(max(point[axis] for point in points), 5) for axis in range(3)],
    }


def setup_evidence_scene(scene: bpy.types.Scene) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Cabinet_World")
    scene.world.color = (0.004, 0.008, 0.01)
    scene.view_settings.look = "AgX - Medium High Contrast"

    bpy.ops.object.camera_add(location=(1.86, -1.34, 0.7))
    camera = bpy.context.view_layer.objects.active
    camera.name = "Cabinet_Evidence_Camera"
    camera.data.lens = 54
    look_at(camera, Vector((0.0, 0.0, 0.0)))
    scene.camera = camera

    lights: list[bpy.types.Object] = []
    bpy.ops.object.light_add(type="AREA", location=(1.35, -0.95, 1.2))
    key = bpy.context.view_layer.objects.active
    key.name = "Cabinet_Key"
    key.data.energy = 560
    key.data.shape = "DISK"
    key.data.size = 1.45
    look_at(key, Vector((0.0, 0.0, 0.0)))
    lights.append(key)

    bpy.ops.object.light_add(type="AREA", location=(0.45, 1.25, 0.35))
    fill = bpy.context.view_layer.objects.active
    fill.name = "Cabinet_Fill"
    fill.data.energy = 300
    fill.data.color = (0.12, 0.5, 0.46)
    fill.data.size = 1.1
    look_at(fill, Vector((0.0, 0.0, 0.0)))
    lights.append(fill)

    bpy.ops.object.light_add(type="AREA", location=(-0.65, 0.0, 0.75))
    rim = bpy.context.view_layer.objects.active
    rim.name = "Cabinet_Rim"
    rim.data.energy = 360
    rim.data.color = (0.16, 0.58, 0.62)
    rim.data.size = 0.9
    look_at(rim, Vector((0.0, 0.0, 0.0)))
    lights.append(rim)
    return camera, lights


def export_collection(
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
    if "export_nla_strips_merged_animation_name" in properties:
        kwargs["export_nla_strips_merged_animation_name"] = CLIP_NAME
    if "export_apply" in properties:
        kwargs["export_apply"] = True
    if "export_image_format" in properties:
        kwargs["export_image_format"] = "AUTO"
    if "export_cameras" in properties:
        kwargs["export_cameras"] = False
    if "export_lights" in properties:
        kwargs["export_lights"] = False
    if "use_active_scene" in properties:
        kwargs["use_active_scene"] = True
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError(f"Cabinet GLB export failed: {result}")


TRACKED_DATA_COLLECTIONS = (
    "objects",
    "meshes",
    "materials",
    "images",
    "actions",
    "collections",
    "scenes",
    "worlds",
    "cameras",
    "lights",
    "node_groups",
    "textures",
)


def snapshot_datablocks() -> dict[str, set[int]]:
    return {
        name: {datablock.as_pointer() for datablock in getattr(bpy.data, name)}
        for name in TRACKED_DATA_COLLECTIONS
    }


def cleanup_new_datablocks(before: dict[str, set[int]]) -> None:
    # Objects are unlinked first, then their containers, then dependent data.
    # The pointer snapshot prevents this cleanup from touching any user data
    # that existed before the temporary cabinet scene was created.
    removal_order = (
        "objects",
        "scenes",
        "collections",
        "actions",
        "meshes",
        "materials",
        "cameras",
        "lights",
        "worlds",
        "node_groups",
        "textures",
        "images",
    )
    for name in removal_order:
        collection = getattr(bpy.data, name)
        created = [item for item in collection if item.as_pointer() not in before[name]]
        for item in created:
            try:
                if name == "objects":
                    collection.remove(item, do_unlink=True)
                else:
                    collection.remove(item)
            except (ReferenceError, RuntimeError):
                # A dependency may already have been removed along with its
                # owner.  Only pre-existing pointers are safety-critical.
                continue


def main() -> dict[str, Any]:
    require_source()
    original_path = bpy.data.filepath
    if not original_path:
        raise RuntimeError("The live Blender file must be saved before cabinet authoring")

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    original_scene = bpy.context.scene
    original_frame = original_scene.frame_current
    original_selected = tuple(bpy.context.selected_objects)
    original_active = bpy.context.view_layer.objects.active
    original_dirty = bpy.data.is_dirty
    before = snapshot_datablocks()
    result: dict[str, Any] = {}
    try:
        # Work in an isolated scene inside the existing Blender session.  This
        # preserves unsaved user changes in the currently open grimoire file.
        scene = bpy.data.scenes.new("Maw_Cabinet_Authoring")
        bpy.context.window.scene = scene
        scene.render.fps = FPS
        scene.render.fps_base = 1.0
        scene.frame_start = FRAME_CLOSED
        scene.frame_end = FRAME_OPEN
        scene.frame_set(FRAME_CLOSED)

        collection = bpy.data.collections.new(COLLECTION_NAME)
        scene.collection.children.link(collection)

        bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLB))
        imported_meshes = [obj for obj in scene.objects if obj.type == "MESH"]
        if len(imported_meshes) != 1:
            raise RuntimeError(f"Expected one source cabinet mesh, found {len(imported_meshes)}")
        source = imported_meshes[0]
        source.name = "Cabinet_Source_Temporary"

        segmented = source.data.copy()
        segmented.name = "Cabinet_Segmented_WorkMesh"
        bisect_door_boundaries(segmented)

        body_mesh = filtered_mesh(segmented, "Cabinet_Body_Mesh", lambda point: not is_door_region(point))
        left_mesh = filtered_mesh(
            segmented,
            "Cabinet_Door_L_Surface_Mesh",
            lambda point: is_door_region(point) and point.y >= -EPSILON,
        )
        right_mesh = filtered_mesh(
            segmented,
            "Cabinet_Door_R_Surface_Mesh",
            lambda point: is_door_region(point) and point.y < -EPSILON,
        )

        root = bpy.data.objects.new(ROOT_NAME, None)
        collection.objects.link(root)
        root.empty_display_type = "PLAIN_AXES"
        root["interaction"] = "click-toggle-open-close"
        root["openClip"] = CLIP_NAME
        root["openDurationSeconds"] = (FRAME_OPEN - FRAME_CLOSED) / FPS
        root["source"] = "Existing LUX3D cabinet refined and articulated in Blender"

        body = bpy.data.objects.new(BODY_NAME, body_mesh)
        collection.objects.link(body)
        body.parent = root

        left_hinge = bpy.data.objects.new(LEFT_HINGE_NAME, None)
        collection.objects.link(left_hinge)
        left_hinge.empty_display_type = "SINGLE_ARROW"
        left_hinge.empty_display_size = 0.16
        left_hinge.location = (0.14, DOOR_Y_MAX, 0.0)
        left_hinge.parent = root

        right_hinge = bpy.data.objects.new(RIGHT_HINGE_NAME, None)
        collection.objects.link(right_hinge)
        right_hinge.empty_display_type = "SINGLE_ARROW"
        right_hinge.empty_display_size = 0.16
        right_hinge.location = (0.14, -DOOR_Y_MAX, 0.0)
        right_hinge.parent = root

        left_surface = bpy.data.objects.new(LEFT_SURFACE_NAME, left_mesh)
        collection.objects.link(left_surface)
        parent_keep_world(left_surface, left_hinge)
        right_surface = bpy.data.objects.new(RIGHT_SURFACE_NAME, right_mesh)
        collection.objects.link(right_surface)
        parent_keep_world(right_surface, right_hinge)

        interior_material = make_principled_material(
            "Cabinet_Interior_Dark_Teal",
            (0.0018, 0.0065, 0.007, 1.0),
            metallic=0.12,
            roughness=0.82,
        )
        door_back_material = make_principled_material(
            "Cabinet_Door_Back_Oxidized",
            (0.0008, 0.0026, 0.0022, 1.0),
            metallic=0.12,
            roughness=0.84,
        )

        # Deep, deliberately dark cabinet interior.  The original source has no
        # modeled interior because it was authored as a closed prop.
        interior_parts = [
            make_box(collection, "Cabinet_Interior_Back", (-0.205, 0.0, 0.0), (0.025, 0.70, 0.62), interior_material),
            make_box(collection, "Cabinet_Interior_LeftWall", (-0.035, 0.35, 0.0), (0.34, 0.025, 0.62), interior_material),
            make_box(collection, "Cabinet_Interior_RightWall", (-0.035, -0.35, 0.0), (0.34, 0.025, 0.62), interior_material),
            make_box(collection, "Cabinet_Interior_Top", (-0.035, 0.0, 0.31), (0.34, 0.70, 0.025), interior_material),
            make_box(collection, "Cabinet_Interior_Bottom", (-0.035, 0.0, -0.31), (0.34, 0.70, 0.025), interior_material),
            make_box(collection, "Cabinet_Aperture_LeftTrim", (0.145, 0.372, 0.0), (0.028, 0.036, 0.73), interior_material),
            make_box(collection, "Cabinet_Aperture_RightTrim", (0.145, -0.372, 0.0), (0.028, 0.036, 0.73), interior_material),
            make_box(collection, "Cabinet_Aperture_TopTrim", (0.145, 0.0, 0.347), (0.028, 0.744, 0.036), interior_material),
            make_box(collection, "Cabinet_Aperture_BottomTrim", (0.145, 0.0, -0.347), (0.028, 0.744, 0.036), interior_material),
        ]
        for part in interior_parts:
            part.parent = root

        left_back = make_box(
            collection,
            "Cabinet_Door_L_Back",
            (0.135, 0.195, 0.0),
            (0.055, 0.38, 0.70),
            door_back_material,
            bevel=0.006,
        )
        parent_keep_world(left_back, left_hinge)
        right_back = make_box(
            collection,
            "Cabinet_Door_R_Back",
            (0.135, -0.195, 0.0),
            (0.055, 0.38, 0.70),
            door_back_material,
            bevel=0.006,
        )
        parent_keep_world(right_back, right_hinge)

        # Remove the temporary unsplit source after all mesh datablocks have
        # been copied; it must never be exported alongside the articulated set.
        source_mesh = source.data
        bpy.data.objects.remove(source, do_unlink=True)
        if source_mesh.users == 0:
            bpy.data.meshes.remove(source_mesh)
        if segmented.users == 0:
            bpy.data.meshes.remove(segmented)

        action_names = [
            animate_hinge(left_hinge, OPEN_ANGLE_DEGREES),
            animate_hinge(right_hinge, -OPEN_ANGLE_DEGREES),
        ]

        camera, _lights = setup_evidence_scene(scene)
        pose_debug: dict[str, Any] = {}
        for label, frame in (
            ("closed", FRAME_CLOSED),
            ("half-open", 20),
            ("open", FRAME_OPEN),
        ):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            pose_debug[label] = {
                "left_hinge_z_degrees": round(math.degrees(left_hinge.rotation_euler.z), 4),
                "right_hinge_z_degrees": round(math.degrees(right_hinge.rotation_euler.z), 4),
                "left_surface_world_translation": [
                    round(value, 5) for value in left_surface.matrix_world.translation
                ],
                "right_surface_world_translation": [
                    round(value, 5) for value in right_surface.matrix_world.translation
                ],
                "left_surface_bounds": world_mesh_bounds(left_surface),
                "right_surface_bounds": world_mesh_bounds(right_surface),
            }
        evidence: dict[str, str] = {}
        for label, frame in (
            ("closed", FRAME_CLOSED),
            ("half-open", 20),
            ("open", FRAME_OPEN),
        ):
            scene.frame_set(frame)
            render_path = EVIDENCE_DIR / f"cabinet-authored-{label}.png"
            scene.render.filepath = str(render_path)
            bpy.ops.render.render(write_still=True)
            evidence[label] = str(render_path)

        scene.frame_set(FRAME_CLOSED)
        export_collection(collection, root, GLB_PATH)
        bpy.data.libraries.write(
            str(BLEND_PATH),
            {scene},
            path_remap="ABSOLUTE",
            fake_user=False,
            compress=True,
        )

        meshes = [obj for obj in collection.objects if obj.type == "MESH"]
        result = {
            "source": str(SOURCE_GLB),
            "blend": str(BLEND_PATH),
            "glb": str(GLB_PATH),
            "glb_bytes": GLB_PATH.stat().st_size,
            "collection": COLLECTION_NAME,
            "objects": len(collection.objects),
            "mesh_objects": len(meshes),
            "body_polygons": len(body.data.polygons),
            "left_door_polygons": len(left_surface.data.polygons),
            "right_door_polygons": len(right_surface.data.polygons),
            "clip": CLIP_NAME,
            "clip_seconds": (FRAME_OPEN - FRAME_CLOSED) / FPS,
            "actions": action_names,
            "pose_debug": pose_debug,
            "evidence": evidence,
            "live_file_preserved": original_path,
            "live_file_was_dirty": original_dirty,
            "live_frame_preserved": original_frame,
        }
        print(json.dumps(result, ensure_ascii=False))
        return result
    finally:
        bpy.context.window.scene = original_scene
        original_scene.frame_set(original_frame)
        cleanup_new_datablocks(before)
        for obj in original_scene.objects:
            obj.select_set(False)
        for obj in original_selected:
            if obj.name in original_scene.objects:
                obj.select_set(True)
        if original_active is not None and original_active.name in original_scene.objects:
            bpy.context.view_layer.objects.active = original_active


main()

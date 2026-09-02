from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(r"C:\Users\A\Documents\Codex\2026-08-27\ni-x\work\cthulhu-studio")
SOURCE_DIR = PROJECT_ROOT / "raw-models" / "blender" / "abyss-grimoire"
BLEND_PATH = SOURCE_DIR / "abyss-grimoire-animated.blend"
GLB_PATH = PROJECT_ROOT / "public" / "models" / "abyss-grimoire-animated.glb"
MANIFEST_PATH = SOURCE_DIR / "abyss-grimoire-animation.json"
REFERENCE_PATH = SOURCE_DIR / "abyss-grimoire-reference.png"

COLLECTION_NAME = "Codex_Abyss_Grimoire"
CLIP_NAME = "Grimoire_3Click_Cycle"
FPS = 30
FRAME_START = 1
FRAME_OPEN_END = 46
FRAME_FLIP_END = 136
FRAME_CLOSE_END = 181

BOOK_W = 3.60
BOOK_D = 2.55
COVER_T = 0.14
PAGE_BLOCK_H = 0.46
# The top liner sits 0.098 below this hinge.  0.804 leaves roughly 0.0026
# units above the tallest Page_01 ink ribbon while visually closing the book.
TOP_HINGE_Z = 0.804


def clear_previous_collection(name: str) -> None:
    collection = bpy.data.collections.get(name)
    if collection is None:
        return
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def material(
    name: str,
    base_color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    if shader is None:
        shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = base_color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        strength_input = shader.inputs.get("Emission Strength")
        if emission_input is not None:
            emission_input.default_value = emission
        if strength_input is not None:
            strength_input.default_value = emission_strength
    return mat


def set_active(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    set_active(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def add_empty(
    name: str,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    location=(0.0, 0.0, 0.0),
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.18
    if parent is not None:
        obj.parent = parent
    obj.location = location
    return obj


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    bevel: float = 0.025,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.active_object
    obj.name = name
    link_only(obj, collection)
    obj.dimensions = dimensions
    set_active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Codex_Rounded_Edges", "BEVEL")
        mod.width = min(bevel, min(dimensions) * 0.45)
        mod.segments = 3
        apply_modifier(obj, mod)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def add_cover_inner_lip(
    name: str,
    height: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    bevel: float = 0.008,
) -> bpy.types.Object:
    # A U-shaped underside lip closes the Tripo cover overhang but stays open
    # at the fixed spine, avoiding any hidden overlap with the spine ribs.
    outer_min_x = -BOOK_W * 0.5 + 0.13
    outer_max_x = BOOK_W * 0.5 - 0.03
    inner_min_x = outer_min_x
    inner_max_x = BOOK_W * 0.5 - 0.07
    outer_y = BOOK_D * 0.5 - 0.02
    inner_y = BOOK_D * 0.5 - 0.11
    half_height = height * 0.5
    outline = (
        (outer_min_x, -outer_y),
        (outer_max_x, -outer_y),
        (outer_max_x, outer_y),
        (outer_min_x, outer_y),
        (inner_min_x, inner_y),
        (inner_max_x, inner_y),
        (inner_max_x, -inner_y),
        (inner_min_x, -inner_y),
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

    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = location
    if bevel > 0:
        modifier = obj.modifiers.new("Codex_Rounded_Edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        apply_modifier(obj, modifier)
    return obj


def add_cover_inner_baffles(
    name: str,
    height: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    # Zero-thickness dark baffles sit in the cover overhang. Their offsets are
    # the first values with a 0.0005-unit margin above the measured 38-frame
    # collision-free thresholds for the page block and animated paper.
    min_x = -BOOK_W * 0.5 + 0.13
    # Extend the perpendicular faces 0.01 unit into the U-shaped lip so the
    # inside corner stays watertight from oblique camera angles.
    max_x = BOOK_W * 0.5 - 0.06
    baffle_y = 1.1559586
    baffle_x = 1.7209586
    right_baffle_half_y = BOOK_D * 0.5 - 0.10
    half_height = height * 0.5
    corner_patch_x = BOOK_W * 0.5 - 0.055
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
        (corner_patch_x, corner_patch_y_min, corner_patch_z_min),
        (corner_patch_x, corner_patch_y_max, corner_patch_z_min),
        (corner_patch_x, corner_patch_y_max, corner_patch_z_max),
        (corner_patch_x, corner_patch_y_min, corner_patch_z_max),
        (corner_patch_x, -corner_patch_y_max, corner_patch_z_min),
        (corner_patch_x, -corner_patch_y_min, corner_patch_z_min),
        (corner_patch_x, -corner_patch_y_min, corner_patch_z_max),
        (corner_patch_x, -corner_patch_y_max, corner_patch_z_max),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
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
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = location
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 48,
    bevel: float = 0.018,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.active_object
    obj.name = name
    link_only(obj, collection)
    if bevel > 0:
        mod = obj.modifiers.new("Codex_Rounded_Edges", "BEVEL")
        mod.width = min(bevel, depth * 0.35)
        mod.segments = 3
        apply_modifier(obj, mod)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def add_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=12,
    )
    obj = bpy.context.active_object
    obj.name = name
    link_only(obj, collection)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def add_sphere(
    name: str,
    scale: tuple[float, float, float],
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24)
    obj = bpy.context.active_object
    obj.name = name
    link_only(obj, collection)
    obj.scale = scale
    set_active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def add_tentacle_relief(
    name: str,
    angle: float,
    length: float,
    parent: bpy.types.Object,
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 4
    curve.bevel_depth = 0.035
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(5)
    for index, point in enumerate(spline.bezier_points):
        t = index / 5.0
        radial = 0.30 + length * t
        curl = 0.34 * math.sin(t * math.pi * 1.35)
        theta = angle + curl
        point.co = (
            BOOK_W * 0.5 + math.cos(theta) * radial,
            math.sin(theta) * radial * 0.74,
            0.118 + 0.012 * math.sin(t * math.pi),
        )
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(mat)
    set_active(obj)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def page_surface_height(
    x: float,
    y: float,
    page_width: float,
    page_depth: float,
    curl: float,
) -> float:
    tx = max(0.0, min(1.0, x / page_width))
    ty = max(0.0, min(1.0, (y + page_depth * 0.5) / page_depth))
    crown = curl * math.sin(math.pi * tx) + 0.035 * tx**5
    edge_wave = 0.006 * math.sin((ty * 5.0 + tx * 1.7) * math.pi)
    return crown + edge_wave * tx


def add_page_mesh(
    name: str,
    page_width: float,
    page_depth: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    *,
    curl: float,
) -> bpy.types.Object:
    nx = 22
    ny = 10
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for ix in range(nx + 1):
        tx = ix / nx
        x = page_width * tx
        for iy in range(ny + 1):
            ty = iy / ny
            y = -page_depth * 0.5 + page_depth * ty
            vertices.append((x, y, page_surface_height(x, y, page_width, page_depth, curl)))
    stride = ny + 1
    for ix in range(nx):
        for iy in range(ny):
            a = ix * stride + iy
            b = (ix + 1) * stride + iy
            c = (ix + 1) * stride + iy + 1
            d = ix * stride + iy + 1
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    solidify = obj.modifiers.new("Codex_Page_Thickness", "SOLIDIFY")
    solidify.thickness = 0.008
    solidify.offset = 0.0
    apply_modifier(obj, solidify)
    bevel = obj.modifiers.new("Codex_Soft_Page_Edge", "BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    apply_modifier(obj, bevel)
    return obj


def add_page_ink_ribbon(
    name: str,
    points: list[tuple[float, float]],
    width: float,
    mat: bpy.types.Material,
    parent: bpy.types.Object,
    collection: bpy.types.Collection,
    *,
    page_width: float,
    page_depth: float,
    curl: float,
    cyclic: bool = False,
) -> bpy.types.Object:
    if len(points) < 2:
        raise ValueError(f"{name} needs at least two path points")
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    count = len(points)
    for index, (x, y) in enumerate(points):
        if cyclic:
            before = points[(index - 1) % count]
            after = points[(index + 1) % count]
        elif index == 0:
            before = points[index]
            after = points[index + 1]
        elif index == count - 1:
            before = points[index - 1]
            after = points[index]
        else:
            before = points[index - 1]
            after = points[index + 1]
        tangent_x = after[0] - before[0]
        tangent_y = after[1] - before[1]
        tangent_length = math.hypot(tangent_x, tangent_y)
        if tangent_length <= 1.0e-8:
            raise ValueError(f"{name} has a zero-length path segment")
        normal_x = -tangent_y / tangent_length
        normal_y = tangent_x / tangent_length
        for side in (-0.5, 0.5):
            px = x + normal_x * width * side
            py = y + normal_y * width * side
            # The sheet is solidified by 0.008 and its coarse control grid is
            # linearly triangulated.  This small lift clears that evaluated
            # surface while remaining below the next sheet in the 0.018 stack.
            pz = page_surface_height(px, py, page_width, page_depth, curl) + 0.011
            vertices.append((px, py, pz))
    face_count = count if cyclic else count - 1
    for index in range(face_count):
        next_index = (index + 1) % count
        faces.append((index * 2, index * 2 + 1, next_index * 2 + 1, next_index * 2))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = parent
    mesh.materials.append(mat)
    return obj


def key_rotation(
    obj: bpy.types.Object,
    frame: int,
    y_degrees: float,
    *,
    x_degrees: float = 0.0,
    z_degrees: float = 0.0,
) -> None:
    obj.rotation_euler = (
        math.radians(x_degrees),
        math.radians(y_degrees),
        math.radians(z_degrees),
    )
    obj.keyframe_insert(data_path="rotation_euler", frame=frame, group="Grimoire Motion")


def key_lift(obj: bpy.types.Object, frame: int, base_z: float, lift: float = 0.0) -> None:
    obj.location.z = base_z + lift
    obj.keyframe_insert(data_path="location", frame=frame, group="Grimoire Clearance")


def push_action_to_nla(obj: bpy.types.Object) -> None:
    animation_data = obj.animation_data
    if animation_data is None or animation_data.action is None:
        raise RuntimeError(f"{obj.name} did not receive an action")
    action = animation_data.action
    action.name = f"{CLIP_NAME}__{obj.name}"
    curves = []
    if hasattr(action, "fcurves"):
        curves.extend(action.fcurves)
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in getattr(strip, "channelbags", ()):
                    curves.extend(channelbag.fcurves)
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
    track = animation_data.nla_tracks.new()
    track.name = CLIP_NAME
    strip = track.strips.new(CLIP_NAME, int(action.frame_range[0]), action)
    strip.name = CLIP_NAME
    strip.extrapolation = "NOTHING"
    animation_data.action = None


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


SOURCE_DIR.mkdir(parents=True, exist_ok=True)
GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
clear_previous_collection(COLLECTION_NAME)

scene = bpy.context.scene
scene.render.fps = FPS
scene.render.fps_base = 1.0
scene.frame_start = FRAME_START
scene.frame_end = FRAME_CLOSE_END
scene.frame_set(FRAME_START)

collection = bpy.data.collections.new(COLLECTION_NAME)
scene.collection.children.link(collection)

leather = material(
    "Codex_Grimoire_Leather",
    (0.028, 0.018, 0.015, 1.0),
    metallic=0.04,
    roughness=0.44,
)
inner_leather = material(
    "Codex_Grimoire_InnerLeather",
    (0.065, 0.028, 0.022, 1.0),
    metallic=0.02,
    roughness=0.58,
)
bronze = material(
    "Codex_Grimoire_AgedBronze",
    (0.19, 0.075, 0.023, 1.0),
    metallic=0.88,
    roughness=0.27,
)
verdigris = material(
    "Codex_Grimoire_Verdigris",
    (0.018, 0.15, 0.115, 1.0),
    metallic=0.62,
    roughness=0.34,
)
parchment = material(
    "Codex_Grimoire_Parchment",
    (0.47, 0.315, 0.15, 1.0),
    metallic=0.0,
    roughness=0.82,
)
parchment_light = material(
    "Codex_Grimoire_ParchmentLight",
    (0.66, 0.48, 0.25, 1.0),
    metallic=0.0,
    roughness=0.76,
)
bone = material(
    "Codex_Grimoire_Bone",
    (0.46, 0.32, 0.17, 1.0),
    metallic=0.0,
    roughness=0.68,
)
ink = material(
    "Codex_Grimoire_Ink",
    (0.018, 0.005, 0.004, 1.0),
    metallic=0.05,
    roughness=0.55,
)
teal_glow = material(
    "Codex_Grimoire_EyeGlow",
    (0.015, 0.24, 0.20, 1.0),
    metallic=0.25,
    roughness=0.22,
    emission=(0.0, 0.62, 0.49, 1.0),
    emission_strength=2.8,
)

root = add_empty("GRIMOIRE_ROOT", collection)
root["interaction_clip"] = CLIP_NAME
root["interaction_open_seconds"] = 1.5
root["interaction_flip_seconds"] = 4.5
root["interaction_close_seconds"] = 6.0
root["reference_image"] = str(REFERENCE_PATH)

# Bottom shell and the thick static page block.
add_box(
    "Bottom_Cover",
    (BOOK_W, BOOK_D, COVER_T),
    (0.0, 0.0, COVER_T * 0.5),
    leather,
    collection,
    parent=root,
    bevel=0.07,
)
add_box(
    "Bottom_Cover_InnerPanel",
    (BOOK_W - 0.28, BOOK_D - 0.28, 0.026),
    (0.0, 0.0, COVER_T + 0.013),
    inner_leather,
    collection,
    parent=root,
    bevel=0.035,
)
add_box(
    "Page_Block",
    (BOOK_W - 0.24, BOOK_D - 0.20, PAGE_BLOCK_H),
    (0.06, 0.0, COVER_T + PAGE_BLOCK_H * 0.5),
    parchment,
    collection,
    parent=root,
    bevel=0.045,
)

# Visible layered paper ridges around the front and fore edge.
for index in range(12):
    z = 0.18 + index * 0.033
    ridge_mat = parchment_light if index % 3 == 0 else parchment
    add_box(
        f"Page_Ridge_Front_{index + 1:02d}",
        (BOOK_W - 0.34, 0.020, 0.010),
        (0.07, -BOOK_D * 0.5 + 0.095, z),
        ridge_mat,
        collection,
        parent=root,
        bevel=0.004,
    )
    add_box(
        f"Page_Ridge_Fore_{index + 1:02d}",
        (0.020, BOOK_D - 0.32, 0.010),
        (BOOK_W * 0.5 - 0.12, 0.0, z + 0.006 * (index % 2)),
        ridge_mat,
        collection,
        parent=root,
        bevel=0.004,
    )

# Reinforced spine and ribs.
add_box(
    "Spine",
    (0.28, BOOK_D + 0.04, 0.67),
    (-BOOK_W * 0.5 - 0.035, 0.0, 0.355),
    leather,
    collection,
    parent=root,
    bevel=0.105,
)
for index, y in enumerate((-0.92, -0.46, 0.0, 0.46, 0.92), start=1):
    add_box(
        f"Spine_Rib_{index:02d}",
        (0.33, 0.12, 0.71),
        (-BOOK_W * 0.5 - 0.04, y, 0.36),
        bronze if index in (1, 5) else leather,
        collection,
        parent=root,
        bevel=0.055,
    )

# Bottom corner hardware.
for sx in (-1.0, 1.0):
    for sy in (-1.0, 1.0):
        add_box(
            f"Bottom_Corner_{'L' if sx < 0 else 'R'}_{'F' if sy < 0 else 'B'}",
            (0.44, 0.42, 0.045),
            (sx * (BOOK_W * 0.5 - 0.23), sy * (BOOK_D * 0.5 - 0.22), 0.15),
            bronze,
            collection,
            parent=root,
            bevel=0.05,
        )

# The top cover is one animated hinge; every ornament is parented to it.
top_hinge = add_empty(
    "Top_Cover_Hinge",
    collection,
    parent=root,
    location=(-BOOK_W * 0.5, 0.0, TOP_HINGE_Z),
)
add_box(
    "Top_Cover",
    (BOOK_W, BOOK_D, COVER_T),
    (BOOK_W * 0.5, 0.0, 0.0),
    leather,
    collection,
    parent=top_hinge,
    bevel=0.07,
)
add_box(
    "Top_Cover_InnerPanel",
    (BOOK_W - 0.30, BOOK_D - 0.30, 0.028),
    (BOOK_W * 0.5, 0.0, -COVER_T * 0.5 - 0.014),
    inner_leather,
    collection,
    parent=top_hinge,
    bevel=0.04,
)
add_cover_inner_lip(
    "Top_Cover_InnerLip",
    0.084,
    (BOOK_W * 0.5, 0.0, -0.113),
    inner_leather,
    collection,
    parent=top_hinge,
)
add_cover_inner_baffles(
    "Top_Cover_InnerBaffles",
    0.142,
    (BOOK_W * 0.5, 0.0, -0.142),
    inner_leather,
    collection,
    parent=top_hinge,
)

# Raised bronze frame.
for name, dims, loc in (
    ("Top_Frame_Front", (BOOK_W - 0.42, 0.065, 0.038), (BOOK_W * 0.5, -BOOK_D * 0.5 + 0.15, 0.086)),
    ("Top_Frame_Back", (BOOK_W - 0.42, 0.065, 0.038), (BOOK_W * 0.5, BOOK_D * 0.5 - 0.15, 0.086)),
    ("Top_Frame_Spine", (0.065, BOOK_D - 0.42, 0.038), (0.20, 0.0, 0.086)),
    ("Top_Frame_Fore", (0.065, BOOK_D - 0.42, 0.038), (BOOK_W - 0.20, 0.0, 0.086)),
):
    add_box(name, dims, loc, bronze, collection, parent=top_hinge, bevel=0.018)

for sx in (0.27, BOOK_W - 0.27):
    for sy in (-BOOK_D * 0.5 + 0.23, BOOK_D * 0.5 - 0.23):
        corner = add_box(
            f"Top_Corner_{sx:.2f}_{sy:.2f}",
            (0.48, 0.44, 0.055),
            (sx, sy, 0.105),
            bronze,
            collection,
            parent=top_hinge,
            bevel=0.055,
        )
        add_cylinder(
            f"Top_Corner_Rivet_{sx:.2f}_{sy:.2f}",
            0.055,
            0.035,
            (sx, sy, 0.145),
            verdigris,
            collection,
            parent=top_hinge,
            bevel=0.008,
        )

# Cthulhu medallion and integrated reliefs.
add_torus(
    "Elder_Eye_OuterRing",
    0.48,
    0.085,
    (BOOK_W * 0.5, 0.0, 0.142),
    bronze,
    collection,
    parent=top_hinge,
)
add_cylinder(
    "Elder_Eye_VerdigrisDisc",
    0.405,
    0.065,
    (BOOK_W * 0.5, 0.0, 0.132),
    verdigris,
    collection,
    parent=top_hinge,
    bevel=0.018,
)
add_sphere(
    "Elder_Eye_Glow",
    (0.31, 0.18, 0.075),
    (BOOK_W * 0.5, 0.0, 0.190),
    teal_glow,
    collection,
    parent=top_hinge,
)
add_sphere(
    "Elder_Eye_Pupil",
    (0.070, 0.155, 0.085),
    (BOOK_W * 0.5, 0.0, 0.212),
    ink,
    collection,
    parent=top_hinge,
)
for index, angle in enumerate((0.15, 0.95, 1.85, 2.75, 3.55, 4.45, 5.35), start=1):
    add_tentacle_relief(
        f"Attached_Tentacle_Relief_{index:02d}",
        angle,
        0.58 + 0.08 * (index % 2),
        top_hinge,
        bronze if index % 3 else verdigris,
        collection,
    )

# Bone-and-brass clasp attached to the moving top cover.
add_box(
    "Clasp_Brass_Base",
    (0.34, 0.62, 0.105),
    (BOOK_W + 0.04, 0.0, 0.015),
    bronze,
    collection,
    parent=top_hinge,
    bevel=0.06,
)
add_cylinder(
    "Clasp_Bone_Pin",
    0.095,
    0.50,
    (BOOK_W + 0.15, 0.0, 0.045),
    bone,
    collection,
    parent=top_hinge,
    rotation=(math.radians(90.0), 0.0, 0.0),
    bevel=0.025,
)

# Three independent page hinges.  Keep the sheets parallel in either resting
# stack so their solidified/bevelled surfaces never occupy the same volume.
page_hinges: list[bpy.types.Object] = []
page_width = BOOK_W - 0.28
page_depth = BOOK_D - 0.30
page_curl = 0.040
page_base_z = (0.648, 0.630, 0.612)
page_turned_z = (0.950, 0.968, 0.986)
page_turned_angle = -165.0
for index, z_offset in enumerate(page_base_z, start=1):
    hinge = add_empty(
        f"Page_{index:02d}_Hinge",
        collection,
        parent=root,
        location=(-BOOK_W * 0.5 + 0.17, 0.0, z_offset),
    )
    page_hinges.append(hinge)
    add_page_mesh(
        f"Page_{index:02d}",
        page_width,
        page_depth,
        parchment_light if index != 2 else parchment,
        hinge,
        collection,
        curl=page_curl,
    )
    for line_index, y in enumerate((-0.72, -0.52, -0.32, 0.34, 0.54, 0.74), start=1):
        line_length = 1.55 + 0.22 * ((line_index + index) % 3)
        line_points = [
            (0.48 + line_length * step / 24.0, y)
            for step in range(25)
        ]
        add_page_ink_ribbon(
            f"Page_{index:02d}_InkLine_{line_index:02d}",
            line_points,
            0.018,
            ink,
            hinge,
            collection,
            page_width=page_width,
            page_depth=page_depth,
            curl=page_curl,
        )
    if index == 2:
        sigil_center = (2.45, 0.0)
        sigil_points = [
            (
                sigil_center[0] + math.cos(step * math.tau / 64.0) * 0.31,
                sigil_center[1] + math.sin(step * math.tau / 64.0) * 0.31,
            )
            for step in range(64)
        ]
        add_page_ink_ribbon(
            "Page_02_Ritual_Sigil",
            sigil_points,
            0.012,
            ink,
            hinge,
            collection,
            page_width=page_width,
            page_depth=page_depth,
            curl=page_curl,
            cyclic=True,
        )
        for spoke in range(8):
            angle = spoke * math.tau / 8.0
            spoke_points = [
                (
                    sigil_center[0] + math.cos(angle) * (0.04 + 0.27 * step / 8.0),
                    sigil_center[1] + math.sin(angle) * (0.04 + 0.27 * step / 8.0),
                )
                for step in range(9)
            ]
            add_page_ink_ribbon(
                f"Page_02_Sigil_Spoke_{spoke + 1:02d}",
                spoke_points,
                0.010,
                ink,
                hinge,
                collection,
                page_width=page_width,
                page_depth=page_depth,
                curl=page_curl,
            )

# Cover: first click opens, it then holds until the final click segment.
for frame, y, x, z in (
    (1, 0.0, 0.0, 0.0),
    (10, 0.0, 0.0, 0.0),
    (18, -14.0, -1.2, 0.6),
    (31, -104.0, 1.6, -1.0),
    (46, -165.0, 0.0, 0.0),
    (136, -165.0, 0.0, 0.0),
    (166, -165.0, 0.0, 0.0),
    (171, -130.0, -1.0, 0.7),
    (176, -55.0, 1.4, -0.8),
    (179, -12.0, -0.8, 0.4),
    (181, 0.0, 0.0, 0.0),
):
    key_rotation(top_hinge, frame, y, x_degrees=x, z_degrees=z)
push_action_to_nla(top_hinge)

# Exactly three page turns across the second click segment.  Each page first
# clears the right-hand stack, aligns with the opened cover, then settles
# vertically onto the left-hand stack.  The raised left pose keeps the paper
# above both the cover's inner panel and the spine.
page_turn_windows = ((50, 78), (79, 107), (108, 136))
page_close_windows = ((156, 166), (146, 156), (136, 146))
for index, (hinge, turn_window, close_window) in enumerate(
    zip(page_hinges, page_turn_windows, page_close_windows),
    start=1,
):
    turn_start, turn_end = turn_window
    close_start, close_end = close_window
    base_z = hinge.location.z
    turned_lift = page_turned_z[index - 1] - base_z
    for frame, y, x, z in (
        (1, 0.0, 0.0, 0.0),
        (turn_start, 0.0, 0.0, 0.0),
        (turn_start + 3, 0.0, 0.0, 0.0),
        (turn_start + 6, -12.0, 0.4, -0.2),
        (turn_start + 10, -82.0, -1.0, 0.6),
        (turn_start + 18, -148.0, 0.6, -0.35),
        (turn_end - 2, page_turned_angle, 0.0, 0.0),
        (turn_end, page_turned_angle, 0.0, 0.0),
        (136, page_turned_angle, 0.0, 0.0),
        (close_start, page_turned_angle, 0.0, 0.0),
        (close_start + 2, page_turned_angle, 0.0, 0.0),
        (close_start + 4, -135.0, -0.5, 0.35),
        (close_start + 7, -55.0, 0.7, -0.45),
        (close_end - 2, 0.0, 0.0, 0.0),
        (close_end, 0.0, 0.0, 0.0),
        (181, 0.0, 0.0, 0.0),
    ):
        key_rotation(hinge, frame, y, x_degrees=x, z_degrees=z)
    for frame, lift in (
        (1, 0.0),
        (turn_start, 0.0),
        (turn_start + 3, 0.120),
        (turn_start + 6, 0.440),
        (turn_start + 10, 0.520),
        (turn_start + 18, turned_lift + 0.150),
        (turn_end - 2, turned_lift + 0.050),
        (turn_end, turned_lift),
        (136, turned_lift),
        (close_start, turned_lift),
        (close_start + 2, turned_lift + 0.060),
        (close_start + 4, 0.480),
        (close_start + 7, 0.300),
        (close_end - 2, 0.060),
        (close_end, 0.0),
        (181, 0.0),
    ):
        key_lift(hinge, frame, base_z, lift)
    push_action_to_nla(hinge)

# Add interaction metadata and save the authored Blender source.
scene["Codex_Grimoire_Clip"] = CLIP_NAME
scene["Codex_Grimoire_Segments"] = json.dumps(
    {"open": [0.0, 1.5], "flip_three_pages": [1.5, 4.5], "close": [4.5, 6.0]},
    separators=(",", ":"),
)
scene.frame_set(FRAME_START)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

# Export only the namespaced book collection; preserve every pre-existing scene object.
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = root

gltf_properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
export_kwargs = {
    "filepath": str(GLB_PATH),
    "export_format": "GLB",
    "use_selection": True,
    "export_animations": True,
    "export_frame_range": True,
    "export_force_sampling": True,
    "export_extras": True,
    "export_materials": "EXPORT",
    "export_yup": True,
}
if "export_animation_mode" in gltf_properties:
    export_kwargs["export_animation_mode"] = "NLA_TRACKS"
elif "export_nla_strips" in gltf_properties:
    export_kwargs["export_nla_strips"] = True
if "export_apply" in gltf_properties:
    export_kwargs["export_apply"] = True
if "export_nla_strips_merged_animation_name" in gltf_properties:
    export_kwargs["export_nla_strips_merged_animation_name"] = CLIP_NAME
bpy.ops.export_scene.gltf(**export_kwargs)

# Concrete post-write validation sampled inside the live Blender scene.
samples = {}
for frame in (1, 46, 64, 93, 122, 136, 158, 181):
    scene.frame_set(frame)
    samples[str(frame)] = {
        "cover_y_degrees": round(math.degrees(top_hinge.rotation_euler.y), 3),
        "page_y_degrees": [
            round(math.degrees(hinge.rotation_euler.y), 3) for hinge in page_hinges
        ],
    }
scene.frame_set(FRAME_START)

manifest = {
    "asset": "abyss-grimoire-animated",
    "collection": COLLECTION_NAME,
    "clip": CLIP_NAME,
    "fps": FPS,
    "frame_range": [FRAME_START, FRAME_CLOSE_END],
    "segments_seconds": {
        "open": [0.0, 1.5],
        "flip_three_pages": [1.5, 4.5],
        "close": [4.5, 6.0],
    },
    "page_turn_windows_frames": [list(window) for window in page_turn_windows],
    "object_count": len(collection.objects),
    "mesh_count": sum(1 for obj in collection.objects if obj.type == "MESH"),
    "animated_objects": [top_hinge.name, *(hinge.name for hinge in page_hinges)],
    "reference_image": str(REFERENCE_PATH),
    "blend_path": str(BLEND_PATH),
    "glb_path": str(GLB_PATH),
    "glb_size_bytes": GLB_PATH.stat().st_size if GLB_PATH.exists() else 0,
    "sampled_animation": samples,
    "preserved_preexisting_objects": [
        obj.name for obj in bpy.data.objects if obj.name not in collection.objects.keys()
    ],
}
MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

print(json.dumps(manifest, ensure_ascii=False))
manifest

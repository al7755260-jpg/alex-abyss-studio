"""Build the fixed Chinese computer-side inspiration note as a compact GLB.

Run with Blender in background mode, passing the output path after ``--``.
The published GLB contains converted meshes only, so the website never needs
the source font or a runtime font parser.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy


IDEA_TEXT = "永远不要扔掉你喜欢的东西"
LINE_ONE = "永远不要扔掉"
LINE_TWO = "你喜欢的东西"


def cli_output_path() -> Path:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not args:
        raise SystemExit("Pass the output .glb path after --")
    return Path(args[0]).resolve()


def find_font() -> Path:
    candidates = (
        Path(r"C:\Windows\Fonts\NotoSerifSC-VF.ttf"),
        Path(r"C:\Windows\Fonts\STKAITI.TTF"),
        Path(r"C:\Windows\Fonts\simkai.ttf"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("No supported Chinese font was found")


def principled_input(node: bpy.types.ShaderNodeBsdfPrincipled, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    return None


def make_material(
    name: str,
    base: tuple[float, float, float, float],
    emission: tuple[float, float, float, float],
    emission_strength: float,
    metallic: float,
    roughness: float,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = base
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return material

    principled_input(bsdf, "Base Color").default_value = base
    principled_input(bsdf, "Metallic IOR Level", "Metallic").default_value = metallic
    principled_input(bsdf, "Roughness").default_value = roughness
    emission_socket = principled_input(bsdf, "Emission Color", "Emission")
    if emission_socket is not None:
        emission_socket.default_value = emission
    strength_socket = principled_input(bsdf, "Emission Strength")
    if strength_socket is not None:
        strength_socket.default_value = emission_strength
    return material


def create_text(
    name: str,
    body: str,
    location: tuple[float, float, float],
    size: float,
    rotation_z: float,
    font: bpy.types.VectorFont,
    bone: bpy.types.Material,
    ember: bpy.types.Material,
    ember_indices: tuple[int, ...] = (),
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, type="FONT")
    curve.body = body
    curve.font = font
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.space_character = 1.02
    curve.resolution_u = 2
    curve.extrude = 0.072
    curve.bevel_depth = 0.012
    curve.bevel_resolution = 1
    curve.fill_mode = "BOTH"
    curve.materials.append(bone)
    curve.materials.append(ember)

    text = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(text)
    text.location = location
    text.rotation_euler.z = rotation_z
    text["idea_text"] = IDEA_TEXT

    for index in ember_indices:
        if index < len(curve.body_format):
            curve.body_format[index].material_index = 1
    return text


def convert_to_mesh(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    converted = bpy.context.view_layer.objects.active
    converted.select_set(False)
    for polygon in converted.data.polygons:
        polygon.use_smooth = False
    return converted


def main() -> None:
    output_path = cli_output_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.curves,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)

    font = bpy.data.fonts.load(str(find_font()))
    bone = make_material(
        "Idea_Bone_Ivory",
        (0.76, 0.78, 0.70, 1.0),
        (0.16, 0.36, 0.31, 1.0),
        0.35,
        0.10,
        0.55,
    )
    ember = make_material(
        "Idea_Ember_Red",
        (0.55, 0.14, 0.10, 1.0),
        (0.40, 0.03, 0.015, 1.0),
        0.62,
        0.08,
        0.50,
    )
    root = bpy.data.objects.new("Alex_Sudden_Idea", None)
    bpy.context.collection.objects.link(root)
    # Blender text is XY/+Z. This quarter turn converts to glTF XY/+Z after
    # Blender's Z-up to glTF Y-up export transform.
    root.rotation_euler.x = math.pi / 2
    root["inscription"] = IDEA_TEXT

    line_one = create_text(
        "Idea_Line_01",
        LINE_ONE,
        (0.0, 0.34, 0.0),
        1.0,
        math.radians(-1.4),
        font,
        bone,
        ember,
    )
    line_two = create_text(
        "Idea_Line_02",
        LINE_TWO,
        (0.22, -0.42, 0.018),
        0.94,
        math.radians(1.1),
        font,
        bone,
        ember,
        ember_indices=(1, 2),
    )

    mesh_objects = []
    for obj in (line_one, line_two):
        obj.parent = root
        mesh_objects.append(convert_to_mesh(obj))

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in mesh_objects:
        obj.select_set(True)
        obj["inscription"] = IDEA_TEXT
        obj.visible_shadow = False
    bpy.context.view_layer.objects.active = root

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


if __name__ == "__main__":
    main()

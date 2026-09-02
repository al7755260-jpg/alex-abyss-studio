"""Build the approved three-line Chinese tyranny quote as a compact 3D GLB.

Run Blender in background mode and pass the output path after ``--``. The
published file contains converted meshes only, so the website does not need
the source font or a runtime font parser for the default inscription.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy


IDEA_TEXT = "完美，就是一个返自然，用来折磨我们的暴政"
LINE_ONE = "完美，就是一个"
LINE_TWO = "返自然，用来折磨"
LINE_THREE = "我们的暴政"


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
    materials: tuple[bpy.types.Material, ...],
    material_indices: dict[int, int] | None = None,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, type="FONT")
    curve.body = body
    curve.font = font
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.space_character = 0.96
    curve.resolution_u = 1
    curve.extrude = 0.055
    curve.bevel_depth = 0.009
    curve.bevel_resolution = 0
    curve.fill_mode = "BOTH"
    for material in materials:
        curve.materials.append(material)

    text = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(text)
    text.location = location
    text.rotation_euler.z = rotation_z
    text["idea_text"] = IDEA_TEXT

    for index, material_index in (material_indices or {}).items():
        if index < len(curve.body_format):
            curve.body_format[index].material_index = material_index
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
        "Tyranny_Bone_Ivory",
        (0.72, 0.75, 0.68, 1.0),
        (0.12, 0.28, 0.25, 1.0),
        0.30,
        0.08,
        0.56,
    )
    cyan = make_material(
        "Tyranny_Ghost_Cyan",
        (0.12, 0.46, 0.48, 1.0),
        (0.035, 0.44, 0.50, 1.0),
        0.58,
        0.10,
        0.45,
    )
    ember = make_material(
        "Tyranny_Ember_Red",
        (0.50, 0.115, 0.085, 1.0),
        (0.34, 0.02, 0.01, 1.0),
        0.58,
        0.08,
        0.50,
    )
    text_materials = (bone, cyan, ember)

    root = bpy.data.objects.new("Alex_Perfect_Tyranny_Quote", None)
    bpy.context.collection.objects.link(root)
    root.rotation_euler.x = math.pi / 2
    root["inscription"] = IDEA_TEXT

    line_one = create_text(
        "Tyranny_Line_01",
        LINE_ONE,
        (-0.12, 0.60, 0.0),
        0.82,
        math.radians(-1.2),
        font,
        text_materials,
        material_indices={0: 1, 1: 1},
    )
    line_two = create_text(
        "Tyranny_Line_02",
        LINE_TWO,
        (0.08, -0.05, 0.012),
        0.78,
        math.radians(0.8),
        font,
        text_materials,
        material_indices={0: 2, 1: 2, 2: 2},
    )
    line_three = create_text(
        "Tyranny_Line_03",
        LINE_THREE,
        (0.26, -0.70, 0.024),
        0.92,
        math.radians(-0.7),
        font,
        text_materials,
        material_indices={3: 2, 4: 2},
    )

    mesh_objects = []
    for obj in (line_one, line_two, line_three):
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

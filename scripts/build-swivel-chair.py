"""Build a two-part swivel chair GLB from the existing LUX3D source.

Run with an isolated Blender process, for example:

    blender --background --factory-startup --python scripts/build-swivel-chair.py

The source is already a detailed textured chair, but it is delivered as one
mesh containing thousands of disconnected surface islands.  Islands whose
lowest source-space Y coordinate is at or below the swivel junction stay on
the static base.  The remaining islands become the rotating upper chair.

Blender is Z-up, while glTF is Y-up.  Consequently SOURCE_Y_THRESHOLD is used
as a Blender Z coordinate after import and exports back to the requested glTF
Y coordinate.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_SOURCE = PROJECT_ROOT / "raw-models" / "chair.glb"
DEFAULT_OUTPUT = PROJECT_ROOT / "raw-models" / "chair-swivel.glb"
SOURCE_Y_THRESHOLD = -0.22
EPSILON = 1.0e-7

ROOT_NAME = "Chair_Root"
BASE_NAME = "Chair_Base"
SWIVEL_NAME = "Chair_Swivel"
UPPER_NAME = "Chair_Upper"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split the LUX3D chair into a static base and rotating upper chair."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--source-y-threshold",
        type=float,
        default=SOURCE_Y_THRESHOLD,
        help="glTF source-space Y coordinate of the swivel junction.",
    )
    blender_separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    return parser.parse_args(sys.argv[blender_separator + 1 :])


def clear_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in tuple(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def union_find_components(
    mesh: bpy.types.Mesh,
    threshold: float,
) -> tuple[list[bool], dict[str, int]]:
    vertex_count = len(mesh.vertices)
    parent = list(range(vertex_count))
    size = [1] * vertex_count

    def find(index: int) -> int:
        root = index
        while parent[root] != root:
            root = parent[root]
        while parent[index] != index:
            next_index = parent[index]
            parent[index] = root
            index = next_index
        return root

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root == second_root:
            return
        if size[first_root] < size[second_root]:
            first_root, second_root = second_root, first_root
        parent[second_root] = first_root
        size[first_root] += size[second_root]

    for polygon in mesh.polygons:
        vertices = polygon.vertices
        if len(vertices) < 2:
            continue
        anchor = vertices[0]
        for index in vertices[1:]:
            union(anchor, index)

    component_min_z: dict[int, float] = {}
    component_max_z: dict[int, float] = {}
    for vertex in mesh.vertices:
        root = find(vertex.index)
        z = vertex.co.z
        component_min_z[root] = min(component_min_z.get(root, z), z)
        component_max_z[root] = max(component_max_z.get(root, z), z)

    component_is_upper = {
        root: minimum >= threshold - EPSILON
        for root, minimum in component_min_z.items()
    }
    vertex_is_upper = [component_is_upper[find(index)] for index in range(vertex_count)]

    upper_polygons = 0
    base_polygons = 0
    for polygon in mesh.polygons:
        flags = {vertex_is_upper[index] for index in polygon.vertices}
        if len(flags) != 1:
            raise RuntimeError(
                f"Polygon {polygon.index} crosses component groups; source connectivity is invalid."
            )
        if flags.pop():
            upper_polygons += 1
        else:
            base_polygons += 1

    crossing_components = sum(
        minimum < threshold - EPSILON and component_max_z[root] >= threshold - EPSILON
        for root, minimum in component_min_z.items()
    )
    stats = {
        "components": len(component_min_z),
        "crossing_components_kept_on_base": crossing_components,
        "base_polygons": base_polygons,
        "upper_polygons": upper_polygons,
        "base_vertices_selected": vertex_count - sum(vertex_is_upper),
        "upper_vertices_selected": sum(vertex_is_upper),
    }
    return vertex_is_upper, stats


def separate_upper(
    source: bpy.types.Object,
    vertex_is_upper: list[bool],
) -> tuple[bpy.types.Object, bpy.types.Object]:
    source.name = BASE_NAME
    source.data.name = f"{BASE_NAME}_Mesh"
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")

    edit_mesh = bmesh.from_edit_mesh(source.data)
    edit_mesh.verts.ensure_lookup_table()
    edit_mesh.verts.index_update()
    if len(edit_mesh.verts) != len(vertex_is_upper):
        raise RuntimeError("Vertex count changed before chair separation.")
    for vertex in edit_mesh.verts:
        vertex.select_set(vertex_is_upper[vertex.index])
    edit_mesh.select_flush(True)
    bmesh.update_edit_mesh(source.data, loop_triangles=False, destructive=False)

    result = bpy.ops.mesh.separate(type="SELECTED")
    if "FINISHED" not in result:
        raise RuntimeError(f"Chair upper separation failed: {result}")
    bpy.ops.object.mode_set(mode="OBJECT")

    separated = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    if len(separated) != 2 or source not in separated:
        raise RuntimeError(f"Expected two separated chair meshes, found {len(separated)}.")
    upper = next(obj for obj in separated if obj != source)
    upper.name = UPPER_NAME
    upper.data.name = f"{UPPER_NAME}_Mesh"
    return source, upper


def object_world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    maximum = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return minimum, maximum


def create_hierarchy(
    base: bpy.types.Object,
    upper: bpy.types.Object,
    threshold: float,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    collection = bpy.context.scene.collection
    root = bpy.data.objects.new(ROOT_NAME, None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root["interaction"] = "click-rotate-120-degrees"
    root["turnStepDegrees"] = 120.0
    root["source"] = "Existing LUX3D chair articulated in isolated Blender process"

    swivel = bpy.data.objects.new(SWIVEL_NAME, None)
    collection.objects.link(swivel)
    swivel.empty_display_type = "SINGLE_ARROW"
    swivel.empty_display_size = 0.12
    swivel.parent = root
    swivel.location = (0.0, 0.0, threshold)
    swivel["axis"] = "source-y"
    swivel["sourceY"] = threshold

    base.parent = root
    base.location = (0.0, 0.0, 0.0)
    base.rotation_euler = (0.0, 0.0, 0.0)
    base.scale = (1.0, 1.0, 1.0)

    # Keep the original world-space geometry while parenting it below the
    # offset pivot.  The glTF exporter writes this as +0.22 on Chair_Upper,
    # cancelling the -0.22 rest translation on Chair_Swivel.
    upper.parent = swivel
    upper.location = (0.0, 0.0, -threshold)
    upper.rotation_euler = (0.0, 0.0, 0.0)
    upper.scale = (1.0, 1.0, 1.0)
    return root, swivel


def export_glb(root: bpy.types.Object, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [root, *root.children_recursive]
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {
        "filepath": str(output),
        "export_format": "GLB",
        "use_selection": True,
        "export_animations": False,
        "export_extras": True,
        "export_materials": "EXPORT",
        "export_yup": True,
    }
    if "export_apply" in properties:
        kwargs["export_apply"] = False
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
        raise RuntimeError(f"Chair GLB export failed: {result}")


def main() -> None:
    args = parse_args()
    source_path = args.source.resolve()
    output_path = args.output.resolve()
    threshold = float(args.source_y_threshold)

    if not source_path.is_file():
        raise FileNotFoundError(f"Missing chair source GLB: {source_path}")
    if source_path == output_path:
        raise RuntimeError("Source and output GLB paths must differ.")

    clear_scene()
    result = bpy.ops.import_scene.gltf(filepath=str(source_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Chair GLB import failed: {result}")

    imported_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(imported_meshes) != 1:
        raise RuntimeError(f"Expected one source chair mesh, found {len(imported_meshes)}.")
    source = imported_meshes[0]
    source_world = source.matrix_world.copy()
    if source.parent is not None:
        source.parent = None
        source.matrix_world = source_world
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    source_bounds = object_world_bounds(source)
    source_materials = tuple(source.data.materials)
    source_polygon_count = len(source.data.polygons)
    vertex_is_upper, stats = union_find_components(source.data, threshold)
    base, upper = separate_upper(source, vertex_is_upper)
    root, swivel = create_hierarchy(base, upper, threshold)

    if len(base.data.polygons) + len(upper.data.polygons) != source_polygon_count:
        raise RuntimeError("Triangle count changed while separating chair parts.")
    if tuple(base.data.materials) != source_materials or tuple(upper.data.materials) != source_materials:
        raise RuntimeError("Chair material slots were not reused by both separated parts.")

    bpy.context.view_layer.update()
    combined_min = Vector(
        min(object_world_bounds(obj)[0][axis] for obj in (base, upper))
        for axis in range(3)
    )
    combined_max = Vector(
        max(object_world_bounds(obj)[1][axis] for obj in (base, upper))
        for axis in range(3)
    )
    for axis in range(3):
        if abs(combined_min[axis] - source_bounds[0][axis]) > 1.0e-5:
            raise RuntimeError("Separated chair minimum bounds do not match the source.")
        if abs(combined_max[axis] - source_bounds[1][axis]) > 1.0e-5:
            raise RuntimeError("Separated chair maximum bounds do not match the source.")

    export_glb(root, output_path)
    if not output_path.is_file() or output_path.stat().st_size < 12:
        raise RuntimeError(f"Chair GLB output is invalid: {output_path}")

    report = {
        "source": str(source_path),
        "output": str(output_path),
        "output_bytes": output_path.stat().st_size,
        "source_y_threshold": threshold,
        "source_polygons": source_polygon_count,
        "base_polygons": len(base.data.polygons),
        "upper_polygons": len(upper.data.polygons),
        "shared_materials": [material.name for material in source_materials],
        "hierarchy": {
            ROOT_NAME: [BASE_NAME, SWIVEL_NAME],
            SWIVEL_NAME: [UPPER_NAME],
        },
        "component_stats": stats,
        "blender_pivot": list(swivel.location),
        "source_bounds_blender": [list(source_bounds[0]), list(source_bounds[1])],
    }
    print("SWIVEL_CHAIR_BUILD=" + json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()

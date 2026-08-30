import json
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/models/seagull/seagull-flight.glb"
AUTHORING_MANIFEST = ROOT / "assets-source/seagull/seagull-authoring-manifest.json"
WEB_MANIFEST = ROOT / "public/models/seagull/manifest.json"


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    mesh = bpy.data.objects["seagull_web"]
    rig = bpy.data.objects["seagull_flight_rig"]
    for pose_bone in rig.pose.bones:
        pose_bone.matrix_basis.identity()
    bpy.context.view_layer.update()

    export_material = bpy.data.materials.new("Seagull_Web_PBR")
    export_material.use_nodes = True
    shader = export_material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.82, 0.84, 0.84, 1.0)
    shader.inputs["Roughness"].default_value = 0.72
    shader.inputs["Metallic"].default_value = 0.0
    shader.inputs["IOR"].default_value = 1.46
    mesh.data.materials.clear()
    mesh.data.materials.append(export_material)

    bpy.ops.object.select_all(action="DESELECT")
    mesh.hide_set(False)
    rig.hide_set(False)
    mesh.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
        export_skins=True,
        export_morph=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_attributes=True,
        export_materials="EXPORT",
        export_yup=True,
        export_extras=True,
    )

    with OUTPUT.open("rb") as glb_file:
        glb_file.read(12)
        json_length = int.from_bytes(glb_file.read(4), "little")
        glb_file.read(4)
        gltf = json.loads(glb_file.read(json_length).decode("utf-8").rstrip("\x00 \t\r\n"))
    primitive = gltf["meshes"][0]["primitives"][0]
    exported_vertices = gltf["accessors"][primitive["attributes"]["POSITION"]]["count"]
    exported_triangles = gltf["accessors"][primitive["indices"]]["count"] // 3

    authoring = json.loads(AUTHORING_MANIFEST.read_text(encoding="utf-8"))
    web = {
        **authoring["web"],
        "glb": "/models/seagull/seagull-flight.glb",
        "glbBytes": OUTPUT.stat().st_size,
        "exportedVertices": exported_vertices,
        "exportedTriangles": exported_triangles,
        "exportedJoints": len(gltf["skins"][0]["joints"]),
        "primitiveCount": len(gltf["meshes"][0]["primitives"]),
        "textures": {
            "albedo": "/models/seagull/textures/seagull_albedo.webp",
            "normal": "/models/seagull/textures/seagull_normal.webp",
            "orm": "/models/seagull/textures/seagull_orm.webp",
            "specular": "/models/seagull/textures/seagull_specular.webp",
        },
        "behavior": {
            "defaultCount": 9,
            "stressCount": 18,
            "wingbeatHz": [3.33, 4.29],
            "cruiseSpeedMetersPerSecond": [9.5, 15.7],
            "nearestNeighborMeters": 1.5,
            "normalSceneHeightMeters": [12, 28],
            "lowTransitHeightMeters": [2, 8],
            "mode": "procedural runtime motor; source animation is reference only",
        },
        "delivery": "single skinned GLB plus external PBR maps; runtime owns flap, glide and flock state",
    }
    WEB_MANIFEST.write_text(
        json.dumps({"sourceAudit": authoring["source"], "asset": web}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(OUTPUT), "bytes": OUTPUT.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()

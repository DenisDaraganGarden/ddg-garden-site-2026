"""Export each generated fish collection from the saved authoring blend to GLB."""

from __future__ import annotations

import json
from pathlib import Path

import bpy


ROOT_DIR = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT_DIR / "assets-source" / "fish"
RUNTIME_DIR = ROOT_DIR / "public" / "models" / "fish"
AUTHORING_MANIFEST = SOURCE_DIR / "fish-authoring-manifest.json"
RUNTIME_MANIFEST = RUNTIME_DIR / "manifest.json"


def export_kwargs(filepath: Path):
    requested = {
        "filepath": str(filepath),
        "export_format": "GLB",
        "use_selection": True,
        "export_yup": True,
        "export_apply": False,
        "export_animations": False,
        "export_skins": True,
        "export_all_influences": False,
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": False,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_attributes": True,
    }
    available = {
        prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    return {key: value for key, value in requested.items() if key in available}


manifest = json.loads(AUTHORING_MANIFEST.read_text(encoding="utf-8"))
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

for entry in manifest["species"]:
    collection = bpy.data.collections.get(f"FISH_{entry['id'].upper()}")
    if collection is None:
        raise RuntimeError(f"Missing collection for {entry['id']}")

    bpy.ops.object.select_all(action="DESELECT")
    armature = None
    for obj in collection.all_objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
        if obj.type == "ARMATURE":
            armature = obj
    if armature is None:
        raise RuntimeError(f"Missing armature for {entry['id']}")
    bpy.context.view_layer.objects.active = armature

    output_path = RUNTIME_DIR / f"{entry['id']}.glb"
    result = bpy.ops.export_scene.gltf(**export_kwargs(output_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF export failed for {entry['id']}: {result}")
    entry["glb"] = f"/models/fish/{entry['id']}.glb"
    entry["glbBytes"] = output_path.stat().st_size
    entry["textures"] = {
        name: f"/models/fish/textures/{entry['id']}/{entry['id']}_{name}.webp"
        for name in ("albedo", "normal", "orm", "specular")
    }
    print(f"{entry['id']}: {output_path.stat().st_size} bytes")

manifest["sourceBlend"] = str((SOURCE_DIR / "river_fish_authoring.blend").relative_to(ROOT_DIR))
manifest["delivery"] = "GLB rig plus external shared PBR maps; runtime owns procedural motion."
RUNTIME_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {RUNTIME_MANIFEST}")


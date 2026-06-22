#!/usr/bin/env python
"""
@file Rewrite ONNX `Clip` nodes as `Max` + `Min` for Firefox WebGPU support.

onnxruntime-web's fp16 `Clip` kernel packs the two bounds into a single f32
uniform and unpacks them with `bitcast<vec2<f16>>(attr)[i]`. Firefox's WGSL
front end (naga) rejects indexing the result of that bitcast, so the shader is
invalid and *all* WebGPU inference fails on Firefox. `Min`/`Max` take their
bound as a real tensor input, so they compile to ordinary f16 kernels with no
bitcast.

`Clip(x, lo, hi)` is exactly `Min(Max(x, lo), hi)`, so the rewrite is lossless.
The fp16 converter inserts these Clips only to saturate values into fp16 range,
not as part of the model's math.

Used two ways:
- imported by `export_onnx.py` to fix every fresh export, and
- run as a CLI (`python clip_to_minmax.py <model.onnx>`) to fix a committed
  model in place without retraining.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import onnx
from onnx import helper


def _bound_inputs(node: onnx.NodeProto) -> tuple[str, str]:
    """The (lo, hi) bound tensor names of a Clip node, '' when a bound is absent.

    Opset 11+ passes bounds as optional inputs; a skipped bound is an empty
    string. Legacy opset <11 used min/max attributes, surfaced here as Constant
    nodes so the rewrite stays uniform.
    """
    lo = node.input[1] if len(node.input) > 1 else ""
    hi = node.input[2] if len(node.input) > 2 else ""
    return lo, hi


def _legacy_attr_constants(node: onnx.NodeProto) -> tuple[list[onnx.NodeProto], str, str]:
    """Constant nodes for any min/max given as attributes (opset <11)."""
    consts: list[onnx.NodeProto] = []
    names = {"min": "", "max": ""}
    for attr in node.attribute:
        if attr.name not in names:
            continue
        out = f"{node.output[0]}/clip_{attr.name}"
        tensor = helper.make_tensor(out, onnx.TensorProto.FLOAT, [], [attr.f])
        consts.append(
            helper.make_node("Constant", [], [out], name=out, value=tensor)
        )
        names[attr.name] = out
    return consts, names["min"], names["max"]


def replace_clip_with_min_max(model: onnx.ModelProto) -> int:
    """Replace every `Clip` in the graph with `Max`/`Min`. Returns the count.

    Modifies the graph in place. New nodes are inserted at the Clip's position so
    the graph stays in topological order.
    """
    graph = model.graph
    replaced = 0
    index = 0
    while index < len(graph.node):
        node = graph.node[index]
        if node.op_type != "Clip":
            index += 1
            continue

        x = node.input[0]
        out = node.output[0]
        lo, hi = _bound_inputs(node)
        const_nodes, attr_lo, attr_hi = _legacy_attr_constants(node)
        lo = lo or attr_lo
        hi = hi or attr_hi

        new_nodes = list(const_nodes)
        prefix = node.name or out
        if lo and hi:
            mid = f"{out}/clip_max"
            new_nodes.append(helper.make_node("Max", [x, lo], [mid], name=f"{prefix}_max"))
            new_nodes.append(helper.make_node("Min", [mid, hi], [out], name=f"{prefix}_min"))
        elif lo:
            new_nodes.append(helper.make_node("Max", [x, lo], [out], name=f"{prefix}_max"))
        elif hi:
            new_nodes.append(helper.make_node("Min", [x, hi], [out], name=f"{prefix}_min"))
        else:
            new_nodes.append(helper.make_node("Identity", [x], [out], name=f"{prefix}_identity"))

        del graph.node[index]
        for offset, new_node in enumerate(new_nodes):
            graph.node.insert(index + offset, new_node)
        index += len(new_nodes)
        replaced += 1

    return replaced


def rewrite_file(path: Path) -> int:
    """Rewrite a model file in place, preserving its external-data sidecar."""
    model = onnx.load(str(path), load_external_data=True)
    replaced = replace_clip_with_min_max(model)
    if replaced == 0:
        return 0

    location = path.name + ".data"
    sidecar = path.with_name(location)
    if sidecar.exists():
        sidecar.unlink()
    onnx.save(
        model,
        str(path),
        save_as_external_data=True,
        all_tensors_to_one_file=True,
        location=location,
    )
    if sidecar.exists():
        sidecar.chmod(0o644)
    return replaced


def main() -> None:
    parser = argparse.ArgumentParser(description="Rewrite ONNX Clip nodes as Max+Min in place.")
    parser.add_argument("model", help="Path to the .onnx file to rewrite")
    args = parser.parse_args()

    path = Path(args.model)
    replaced = rewrite_file(path)
    if replaced:
        print(f"replaced {replaced} Clip node(s) with Max/Min in {path}")
    else:
        print(f"no Clip nodes found in {path}; left unchanged")


if __name__ == "__main__":
    main()

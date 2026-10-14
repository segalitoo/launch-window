"""Drawn looks for rendered units (Phase 2, "final character look"), made in Blender's
compositor from the render's own passes, so every frame and direction gets the same
treatment and lines keep one pixel width.

Looks (render_unit.py --look):
  render     the plain Cycles render (the low-poly look, as before)
  cel_black  cel shading: three light bands (cool shadow, mid, warm lit) over the surface
             colour; a black outline, and dark-tone ink inside (between body parts, overlaps)
  cel_tone   the same bands, all ink in a dark tone of the surface colour (softer, closer
             to the painted map)
  paint      the render through a Kuwahara filter: flat brush-like patches, no lines
  hybrid     cel bands through the Kuwahara filter, then dark-tone ink

Thresholds were measured on Yoav's light pass (shadow side 0.1 to 0.3, lit faces about 1.0).
"""

import bpy

LOOKS = ("render", "cel_black", "cel_tone", "paint", "hybrid", "outline", "outline_hi", "outline_pop")

# Ran on look A (cel_black): "not clear, we can't see details, a silhouette of a soldier".
# The flat bands threw most of the figure into one shadow band and the inner lines ate the
# few pixels the gear has. The outline looks keep the render's own shading (all the detail)
# and add only what drawn sprites have:
#   outline      the render plus a 1 px black outline
#   outline_hi   plus highlights on the faces lit from the top left, so gear edges catch light
#   outline_pop  plus a brightness gain, so details separate at night
HIGHLIGHT = 0.45  # added surface colour on lit faces
LIT = 0.6  # light level that counts as lit (shadow side 0.1 to 0.3, lit faces about 1.0)
POP_GAIN = 1.3  # a plain gain: Blender's contrast pivots on mid grey and crushed these dark figures

# light bands: (light level where the band starts, band colour). Shadows lean cool and the
# lit side warm, like the painted yard (visual language 6b).
# levels set so a cel figure averages the plain render's brightness (measured on Yoav and the guard)
BANDS = [(0.0, (0.30, 0.31, 0.35)), (0.33, (0.63, 0.63, 0.64)), (0.78, (1.17, 1.13, 1.06))]
# Ink goes where an artist would draw it: the outline, where one body part meets another
# (each bone's parts share an object index), and where a part passes in front of another
# (depth). Not on facet edges: the model is low-poly, so the normal pass has an edge at
# every facet and inked the figure solid.
EDGE_DEPTH = 0.12  # Sobel of the depth pass, metres
INK_BLACK = (0.012, 0.012, 0.014, 1.0)
INK_TONE = 0.28  # tone ink = surface colour x this
# The squad tape on the helmet back is the squad colour (visual language 6c): too small to
# survive the ink, so it gets its own index and is painted back on top, unshaded.
TAPE_INDEX = 99
KUWAHARA_SIZE = 6  # px at 2x supersample


def _menu(sock, *values):
    for v in values:
        try:
            sock.default_value = v
            return
        except (TypeError, ValueError):
            continue
    raise ValueError(f"none of {values} fit {sock.name}")


def setup_look(scene, look):
    """Builds the compositor graph for `look` (one of LOOKS); "render" removes it."""
    if look not in LOOKS:
        raise ValueError(f"unknown look {look}")
    if look == "render":
        scene.compositing_node_group = None
        return
    vl = scene.view_layers[0]
    vl.use_pass_diffuse_color = True
    vl.use_pass_diffuse_direct = True
    vl.use_pass_diffuse_indirect = True
    vl.use_pass_z = True
    vl.use_pass_object_index = True
    # one index per bone: the parts of a limb read as one shape, lines fall between limbs
    bones = sorted({ob.parent_bone for ob in scene.objects if ob.type == "MESH" and ob.parent_bone})
    for ob in scene.objects:
        if ob.type == "MESH":
            ob.pass_index = bones.index(ob.parent_bone) + 1 if ob.parent_bone in bones else len(bones) + 1
            if ob.name.startswith("tape"):
                ob.pass_index = TAPE_INDEX

    ng = bpy.data.node_groups.new(f"look_{look}", "CompositorNodeTree")
    scene.compositing_node_group = ng
    N, L = ng.nodes, ng.links
    rl = N.new("CompositorNodeRLayers")
    out = N.new("NodeGroupOutput")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")

    def mix(blend, a, b, fac=1.0):
        m = N.new("ShaderNodeMix")
        m.data_type, m.blend_type = "RGBA", blend
        if isinstance(fac, float):
            m.inputs[0].default_value = fac
        else:
            L.new(fac, m.inputs[0])
        for sock, v in ((m.inputs[6], a), (m.inputs[7], b)):
            if isinstance(v, tuple):
                sock.default_value = v
            else:
                L.new(v, sock)
        return m.outputs[2]

    def math(op, a, b=None):
        m = N.new("ShaderNodeMath")
        m.operation = op
        for sock, v in ((m.inputs[0], a), (m.inputs[1], b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                L.new(v, sock)
        return m.outputs[0]

    def sobel(src):
        f = N.new("CompositorNodeFilter")
        _menu(f.inputs["Type"], "Sobel", "SOBEL")
        L.new(src, f.inputs["Image"])
        bw = N.new("CompositorNodeRGBToBW")
        L.new(f.outputs[0], bw.inputs[0])
        return bw.outputs[0]

    def kuwahara(src):
        k = N.new("CompositorNodeKuwahara")
        _menu(k.inputs["Type"], "Anisotropic", "ANISOTROPIC")
        k.inputs["Size"].default_value = KUWAHARA_SIZE
        L.new(src, k.inputs["Image"])
        return k.outputs[0]

    col = rl.outputs["Diffuse Color"]
    if look.startswith("outline"):
        image = rl.outputs["Image"]
        if look in ("outline_hi", "outline_pop"):
            light = mix("ADD", rl.outputs["Diffuse Direct"], rl.outputs["Diffuse Indirect"])
            lum = N.new("CompositorNodeRGBToBW")
            L.new(light, lum.inputs[0])
            lit = math("GREATER_THAN", lum.outputs[0], LIT)
            hi = mix("MULTIPLY", col, (HIGHLIGHT, HIGHLIGHT * 0.97, HIGHLIGHT * 0.9, 1.0))
            image = mix("ADD", image, hi, lit)
        if look == "outline_pop":
            image = mix("MULTIPLY", image, (POP_GAIN, POP_GAIN, POP_GAIN, 1.0))
        edge = math("MINIMUM", math("GREATER_THAN", sobel(rl.outputs["Alpha"]), 0.25), math("GREATER_THAN", rl.outputs["Alpha"], 0.5))
        image = mix("MIX", image, INK_BLACK, edge)
        sa = N.new("CompositorNodeSetAlpha")
        _menu(sa.inputs["Type"], "Replace Alpha", "REPLACE_ALPHA")
        L.new(image, sa.inputs["Image"])
        L.new(rl.outputs["Alpha"], sa.inputs["Alpha"])
        L.new(sa.outputs[0], out.inputs[0])
        return
    if look == "paint":
        image = kuwahara(rl.outputs["Image"])
    else:
        # cel: surface colour x the light band
        light = mix("ADD", rl.outputs["Diffuse Direct"], rl.outputs["Diffuse Indirect"])
        lum = N.new("CompositorNodeRGBToBW")
        L.new(light, lum.inputs[0])
        ramp = N.new("ShaderNodeValToRGB")
        cr = ramp.color_ramp
        cr.interpolation = "CONSTANT"
        while len(cr.elements) < len(BANDS):
            cr.elements.new(0.5)
        for el, (pos, c) in zip(cr.elements, BANDS):
            el.position, el.color = pos, (*c, 1.0)
        L.new(lum.outputs[0], ramp.inputs[0])
        image = mix("MULTIPLY", col, ramp.outputs["Color"])
        if look == "hybrid":
            image = kuwahara(image)
        # ink: outline from alpha, creases from normals, overlaps from depth
        # outline inside the silhouette only: 1 px at game size, and the figure keeps its size
        a_edge = math("MINIMUM", math("GREATER_THAN", sobel(rl.outputs["Alpha"]), 0.25), math("GREATER_THAN", rl.outputs["Alpha"], 0.5))
        index = rl.outputs["Object Index"] if "Object Index" in rl.outputs else rl.outputs["IndexOB"]
        n_edge = math("GREATER_THAN", sobel(index), 0.5)
        d_edge = math("GREATER_THAN", sobel(rl.outputs["Depth"]), EDGE_DEPTH)
        inner = math("MAXIMUM", n_edge, d_edge)
        tone = mix("MULTIPLY", col, (INK_TONE, INK_TONE, INK_TONE, 1.0))
        # inner lines always in a dark tone of the surface: black ones inked the figures so
        # dark that the light guard and the olive squad nearly merged (measured)
        image = mix("MIX", image, tone, inner)
        image = mix("MIX", image, INK_BLACK if look == "cel_black" else tone, a_edge)
        tape = math("COMPARE", index, TAPE_INDEX)
        tape_col = mix("MULTIPLY", col, (1.15, 1.15, 1.15, 1.0))
        image = mix("MIX", image, tape_col, tape)
        alpha = rl.outputs["Alpha"]
        sa = N.new("CompositorNodeSetAlpha")
        _menu(sa.inputs["Type"], "Replace Alpha", "REPLACE_ALPHA")
        L.new(image, sa.inputs["Image"])
        L.new(alpha, sa.inputs["Alpha"])
        image = sa.outputs[0]
    L.new(image, out.inputs[0])

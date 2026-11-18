"""Pack self-contained static Blender GLBs with standard glTF attributes.

KHR_mesh_quantization uses the existing node transform for the uniform position
scale. Pivots remain fixed, including both hands on each of the four clock faces.
Accepts uncompressed Blender output with individual, non-interleaved accessors.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np


def pack_static_glb(path, *, preserve_detail=False):
    path=Path(path)
    original=path.read_bytes()
    json_size,=struct.unpack_from('<I',original,12)
    doc=json.loads(original[20:20+json_size])
    if 'KHR_mesh_quantization' in doc.get('extensionsRequired',[]):return
    if doc.get('skins') or doc.get('animations'):
        raise ValueError('This packer is for rigid meshes; skinned or animated assets retain their original transforms.')
    binary=memoryview(original)[28+json_size:]
    views=doc['bufferViews'];accessors=doc['accessors']
    replacements={};processed=set()
    nodes_by_mesh={}
    for node in doc['nodes']:
        if 'mesh' in node:nodes_by_mesh.setdefault(node['mesh'],[]).append(node)
    owners={}
    for index,mesh in enumerate(doc['meshes']):
        for primitive in mesh['primitives']:
            for attributes in [primitive['attributes'],*primitive.get('targets',[])]:
                for aid in attributes.values():owners.setdefault(aid,set()).add(index)
    view_uses={}
    for accessor in accessors:
        v=accessor.get('bufferView')
        if v is not None:view_uses[v]=view_uses.get(v,0)+1

    def source(aid):
        acc=accessors[aid];idx=acc['bufferView'];view=views[idx]
        if acc['componentType']!=5126 or view_uses[idx]!=1 or 'sparse' in acc or 'byteStride' in view or acc.get('byteOffset',0):
            return None
        dims={'VEC2':2,'VEC3':3,'VEC4':4}.get(acc['type'])
        if not dims or view['byteLength']!=acc['count']*dims*4:return None
        return np.frombuffer(binary,'<f4',count=acc['count']*dims,offset=view.get('byteOffset',0)).reshape(-1,dims)

    def install(aid,quantized,component,normalize):
        acc=accessors[aid];vid=acc['bufferView'];components=quantized.shape[1]
        stride=(components*quantized.dtype.itemsize+3)&~3
        padded=np.zeros((len(quantized),stride//quantized.dtype.itemsize),dtype=quantized.dtype)
        padded[:,:components]=quantized
        replacements[vid]=padded.tobytes()
        views[vid]['byteStride']=stride
        acc['componentType']=component
        if normalize:acc['normalized']=True
        else:acc.pop('normalized',None)
        if 'min' in acc:acc['min']=quantized.min(axis=0).tolist()
        if 'max' in acc:acc['max']=quantized.max(axis=0).tolist()
        processed.add(aid)

    for i,mesh in enumerate(doc['meshes']):
        # A flexing journal page keeps its base vertices and deltas in the
        # same coordinate space. Other rigid meshes in the file can be packed.
        if any(p.get('targets') for p in mesh['primitives']):continue
        nodes=nodes_by_mesh.get(i,[])
        positions={p['attributes']['POSITION'] for p in mesh['primitives']}
        arrays={aid:source(aid) for aid in positions}
        # The same uniform factor applies to every primitive of a mesh. A
        # parent's transform must not move children or an independent clock.
        if nodes and not any(n.get('children') for n in nodes) and all(
                owners[a]=={i} and arrays[a] is not None for a in positions):
            extent=max(float(np.max(np.abs(data))) for data in arrays.values())
            if extent>0:
                factor=extent/32767.
                for aid,data in arrays.items():
                    install(aid,np.rint(data/extent*32767).astype('<i2'),5122,False)
                for node in nodes:
                    if 'matrix' in node:
                        for k in range(12):node['matrix'][k]*=factor
                    else:node['scale']=[s*factor for s in node.get('scale',[1.,1.,1.])]
        for primitive in mesh['primitives']:
            for kind,aid in primitive['attributes'].items():
                if aid in processed or owners[aid]!={i}:continue
                data=source(aid)
                if data is None:continue
                if kind=='NORMAL':
                    normals=np.clip(data,-1,1)
                    if preserve_detail:
                        install(aid,np.rint(normals*32767).astype('<i2'),5122,True)
                    else:
                        install(aid,np.rint(normals*127).astype('i1'),5120,True)
                if kind=='COLOR_0' and data.min()>=0 and data.max()<=1:
                    install(aid,np.rint(data*255).astype('u1'),5121,True)
                if preserve_detail and kind.startswith('TEXCOORD_') and data.min()>=0 and data.max()<=1:
                    install(aid,np.rint(data*65535).astype('<u2'),5123,True)
    if not replacements:return
    out=bytearray()
    for i,view in enumerate(views):
        initial=view.get('byteOffset',0)
        raw=replacements.get(i,binary[initial:initial+view['byteLength']])
        out.extend(b'\0'*(-len(out)%4));view['byteOffset']=len(out);view['byteLength']=len(raw);out.extend(raw)
    out.extend(b'\0'*(-len(out)%4))
    doc['buffers'][0]['byteLength']=len(out)
    for key in ('extensionsUsed','extensionsRequired'):
        doc.setdefault(key,[]).append('KHR_mesh_quantization')
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf8')
    encoded+=b' '*(-len(encoded)%4)
    total=12+8+len(encoded)+8+len(out)
    temp=path.with_suffix('.pack.tmp')
    temp.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(encoded),b'JSON')+encoded+
                     struct.pack('<I4s',len(out),b'BIN\0')+out)
    temp.replace(path)


if __name__=='__main__':
    for filename in sys.argv[1:]:pack_static_glb(filename)

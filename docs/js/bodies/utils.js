// Body Creation Utilities

export function makeConvexTriangleMeshShapeFromGeometry(geom, A) {
  const pos = geom.attributes.position.array;
  const idx = geom.index ? geom.index.array : null;
  const triMesh = new A.btTriangleMesh(true, true);
  const addTri = (i0, i1, i2) => {
    const v0 = new A.btVector3(pos[3*i0], pos[3*i0+1], pos[3*i0+2]);
    const v1 = new A.btVector3(pos[3*i1], pos[3*i1+1], pos[3*i1+2]);
    const v2 = new A.btVector3(pos[3*i2], pos[3*i2+1], pos[3*i2+2]);
    triMesh.addTriangle(v0, v1, v2, true);
    A.destroy(v0); A.destroy(v1); A.destroy(v2);
  };
  if (idx) {
    for (let i = 0; i < idx.length; i += 3) addTri(idx[i], idx[i+1], idx[i+2]);
  } else {
    for (let i = 0; i < pos.length/3; i += 3) addTri(i, i+1, i+2);
  }
  try {
    const shape = new A.btConvexTriangleMeshShape(triMesh, true);
    shape.setMargin(0.004);
    return shape;
  } catch(e) {
    const shape = new A.btConvexHullShape();
    for (let i = 0; i < pos.length; i += 3) {
      const v = new A.btVector3(pos[i], pos[i+1], pos[i+2]);
      shape.addPoint(v, true);
      A.destroy(v);
    }
    shape.setMargin(0.004);
    return shape;
  }
}

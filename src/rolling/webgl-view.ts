import type { Point2, RollingInput, RollingMesh, RollingPose, RollingRun, Vec3 } from "./lab-model";

export type RollingCamera = { azimuth: number; elevation: number; zoom: number };
type RGB = [number, number, number];
type DrawingBuffer = { buffer: WebGLBuffer; count: number };
type Ground = { origin: Point2; center: Vec3; radius: number; bounds: [number, number, number, number] };

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const colors = {
  plane: [0.962, 0.976, 0.988], grid: [0.80, 0.85, 0.90], target: [0.128, 0.331, 0.684],
  recovered: [0.820, 0.281, 0.101], body: [0.265, 0.737, 0.773], seam: [0.137, 0.420, 0.514],
  surfaceMarker: [0.998, 0.873, 0.393], contactRim: [0.998, 0.973, 0.909],
} satisfies Record<string, RGB>;

const vertexSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  uniform mat4 uViewProjection;
  uniform mat4 uModel;
  uniform mediump float uLight;
  uniform float uPointSize;
  varying mediump float vShade;
  varying mediump vec3 vBodyPoint;
  void main() {
    vec4 world = uModel * vec4(aPosition, 1.0);
    gl_Position = uViewProjection * world;
    gl_PointSize = uPointSize;
    vBodyPoint = aPosition;
    vShade = 1.0;
    if (uLight > 0.0) {
      vec3 normal = normalize(vec3(uModel * vec4(aNormal, 0.0)));
      float diffuse = max(0.0, dot(normal, normalize(vec3(-0.46, -0.32, 0.83))));
      vShade = 0.50 + 0.50 * diffuse;
    }
  }
`;
const fragmentSource = `
  precision mediump float;
  uniform vec3 uColor;
  uniform vec3 uSeamColor;
  uniform float uLight;
  uniform float uCircle;
  uniform float uRadius;
  varying float vShade;
  varying vec3 vBodyPoint;
  void main() {
    if (uCircle > 0.0 && length(gl_PointCoord - vec2(0.5)) > 0.48) discard;
    vec3 color = uColor;
    if (uLight > 0.0) {
      float meridian = abs(vBodyPoint.x + 0.28 * vBodyPoint.z) / uRadius;
      float stripe = 1.0 - smoothstep(0.023, 0.055, meridian);
      color = mix(uColor, uSeamColor, stripe * 0.78);
    }
    gl_FragColor = vec4(color * vShade, 1.0);
  }
`;

function shader(gl: WebGLRenderingContext, kind: number, source: string) {
  const handle = gl.createShader(kind);
  if (!handle) throw Error("rolling-webgl-shader");
  gl.shaderSource(handle, source);
  gl.compileShader(handle);
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) {
    gl.deleteShader(handle);
    throw Error("rolling-webgl-shader");
  }
  return handle;
}

function program(gl: WebGLRenderingContext) {
  const handle = gl.createProgram();
  if (!handle) throw Error("rolling-webgl-program");
  const shaders: WebGLShader[] = [];
  try {
    shaders.push(shader(gl, gl.VERTEX_SHADER, vertexSource));
    shaders.push(shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    for (const stage of shaders) gl.attachShader(handle, stage);
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw Error("rolling-webgl-program");
    return handle;
  } catch (failure) {
    gl.deleteProgram(handle);
    throw failure;
  } finally {
    for (const stage of shaders) gl.deleteShader(stage);
  }
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function difference(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function unit([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return length ? [x / length, y / length, z / length] : [0, 0, 1];
}

function putMesh({ vertices, triangles }: RollingMesh) {
  if (triangles.length % 3 || triangles.length > 3996) throw Error("rolling-webgl-mesh");
  const data = new Float32Array(triangles.length * 6);
  const point = (index: number): Vec3 => [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = point(triangles[i]), b = point(triangles[i + 1]), c = point(triangles[i + 2]);
    const normal = unit(cross(difference(b, a), difference(c, a)));
    for (const [vertex, position] of [a, b, c].entries()) {
      data.set(position, (i + vertex) * 6);
      data.set(normal, (i + vertex) * 6 + 3);
    }
  }
  return data;
}

function groundFor(run: RollingRun): Ground {
  const origin = run.target[0];
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const track of [run.target, run.contacts]) {
    for (const [x, y] of track) {
      minX = Math.min(minX, x - origin[0]);
      minY = Math.min(minY, y - origin[1]);
      maxX = Math.max(maxX, x - origin[0]);
      maxY = Math.max(maxY, y - origin[1]);
    }
  }
  const a = run.shape.radius;
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, a * 0.65];
  const planExtent = Math.hypot(maxX - minX, maxY - minY) / 2 + a * 1.65;
  const radius = Math.hypot(planExtent, a * 1.95) * 1.02;
  const margin = a * 1.95;
  return { origin, center, radius, bounds: [minX - margin, minY - margin, maxX + margin, maxY + margin] };
}

function plane([x0, y0, x1, y1]: Ground["bounds"]) {
  return new Float32Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0]);
}

function grid([x0, y0, x1, y1]: Ground["bounds"], radius: number) {
  const coordinates: number[] = [];
  const step = Math.max(radius / 2, (x1 - x0) / 14, (y1 - y0) / 14);
  const z = radius * 0.001;
  for (let i = Math.ceil(x0 / step); i <= Math.floor(x1 / step); i++) {
    coordinates.push(i * step, y0, z, i * step, y1, z);
  }
  for (let i = Math.ceil(y0 / step); i <= Math.floor(y1 / step); i++) {
    coordinates.push(x0, i * step, z, x1, i * step, z);
  }
  return new Float32Array(coordinates);
}

function trackBuffer(track: Point2[], origin: Point2, z: number, stride = 1) {
  const coordinates: number[] = [];
  for (let i = 0; i < track.length; i += stride) {
    coordinates.push(track[i][0] - origin[0], track[i][1] - origin[1], z);
  }
  return new Float32Array(coordinates);
}

function model({ localCenter, orientation }: RollingPose) {
  const [w, x, y, z] = orientation;
  return new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 0,
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x), 0,
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y), 0,
    ...localCenter, 1,
  ]);
}

function cameraMatrix({ center, radius }: Ground, { azimuth, elevation, zoom }: RollingCamera, aspect: number) {
  const horizontal = Math.cos(elevation);
  const back: Vec3 = [horizontal * Math.cos(azimuth), horizontal * Math.sin(azimuth), Math.sin(elevation)];
  const eye: Vec3 = [center[0] + back[0] * radius * 3, center[1] + back[1] * radius * 3, center[2] + back[2] * radius * 3];
  const right = unit(cross([0, 0, 1], back));
  const up = cross(back, right);
  const sx = zoom / (radius * Math.max(1, aspect));
  const sy = zoom / (radius * Math.max(1, 1 / aspect));
  const sz = -2 / (radius * 7);
  return new Float32Array([
    right[0] * sx, up[0] * sy, back[0] * sz, 0,
    right[1] * sx, up[1] * sy, back[1] * sz, 0,
    right[2] * sx, up[2] * sy, back[2] * sz, 0,
    -dot(right, eye) * sx, -dot(up, eye) * sy, -dot(back, eye) * sz - 1, 1,
  ]);
}

export function createRollingWebGLView(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgl", {
    alpha: false, antialias: true, depth: true, powerPreference: "low-power",
  });
  if (!context || context.isContextLost()) return null;
  const gl = context;
  const pipeline = program(gl);
  const position = gl.getAttribLocation(pipeline, "aPosition");
  const normal = gl.getAttribLocation(pipeline, "aNormal");
  const uniforms = {
    view: gl.getUniformLocation(pipeline, "uViewProjection"),
    model: gl.getUniformLocation(pipeline, "uModel"),
    color: gl.getUniformLocation(pipeline, "uColor"),
    seam: gl.getUniformLocation(pipeline, "uSeamColor"),
    light: gl.getUniformLocation(pipeline, "uLight"),
    pointSize: gl.getUniformLocation(pipeline, "uPointSize"),
    circle: gl.getUniformLocation(pipeline, "uCircle"),
    radius: gl.getUniformLocation(pipeline, "uRadius"),
  };
  const buffers: WebGLBuffer[] = [];
  let scene: { run: RollingRun; ground: Ground; body: DrawingBuffer; plane: DrawingBuffer;
    grid: DrawingBuffer; target: DrawingBuffer; recovered: DrawingBuffer; bearing: DrawingBuffer; marker: DrawingBuffer } | null = null;

  function forgetScene() {
    for (const buffer of buffers.splice(0)) gl.deleteBuffer(buffer);
    scene = null;
  }

  function allocate(data: Float32Array, stride: number, usage: number = gl.STATIC_DRAW): DrawingBuffer {
    const buffer = gl.createBuffer();
    if (!buffer) throw Error("rolling-webgl-buffer");
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return { buffer, count: data.length / stride };
  }

  function setScene(run: RollingRun | null) {
    if (scene?.run === run) return;
    forgetScene();
    if (!run) return;
    const ground = groundFor(run);
    const a = run.shape.radius;
    const witness = run.shape.vertices.reduce((outer, point) =>
      dot(point, point) > dot(outer, outer) ? point : outer, [0, 0, a] as Vec3);
    scene = {
      run, ground, body: allocate(putMesh(run.mesh), 6),
      plane: allocate(plane(ground.bounds), 3), grid: allocate(grid(ground.bounds, a), 3),
      target: allocate(trackBuffer(run.target, ground.origin, a * 0.004), 3),
      recovered: allocate(trackBuffer(run.contacts, ground.origin, a * 0.007, Math.ceil(run.poses.length / 65)), 3),
      bearing: allocate(new Float32Array(witness.map(value => value * 1.006)), 3),
      marker: allocate(new Float32Array(3), 3, gl.DYNAMIC_DRAW),
    };
  }

  function draw(data: DrawingBuffer, mode: number, color: RGB, transform: Float32Array,
    options: { lighting?: boolean; diameter?: number } = {}) {
    const lighting = options.lighting === true;
    gl.bindBuffer(gl.ARRAY_BUFFER, data.buffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, lighting ? 24 : 0, 0);
    if (lighting) {
      gl.enableVertexAttribArray(normal);
      gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
    } else {
      gl.disableVertexAttribArray(normal);
      gl.vertexAttrib3f(normal, 0, 0, 1);
    }
    gl.uniformMatrix4fv(uniforms.model, false, transform);
    gl.uniform3fv(uniforms.color, color);
    gl.uniform1f(uniforms.light, lighting ? 1 : 0);
    gl.uniform1f(uniforms.circle, options.diameter ? 1 : 0);
    gl.uniform1f(uniforms.pointSize, options.diameter ?? 1);
    gl.drawArrays(mode, 0, data.count);
  }

  function render(run: RollingRun | null, frame: number, camera: RollingCamera, quality: RollingInput["quality"]) {
    setScene(run);
    const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    const compact = quality === "compact";
    const scale = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 2,
      (compact ? 900 : 1600) / Math.max(cssWidth, cssHeight));
    const width = Math.max(1, Math.floor(cssWidth * scale));
    const height = Math.max(1, Math.floor(cssHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.914, 0.942, 0.972, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!scene) return;
    const { ground } = scene;
    const index = Math.max(0, Math.min(scene.run.poses.length - 1, frame));
    const transform = model(scene.run.poses[index]);
    const contact = scene.run.poses[index].target;
    gl.useProgram(pipeline);
    gl.enable(gl.DEPTH_TEST);
    gl.uniformMatrix4fv(uniforms.view, false, cameraMatrix(ground, camera, width / height));
    gl.uniform1f(uniforms.radius, scene.run.shape.radius);
    gl.uniform3fv(uniforms.seam, colors.seam);
    draw(scene.plane, gl.TRIANGLES, colors.plane, identity);
    draw(scene.grid, gl.LINES, colors.grid, identity);
    draw(scene.target, gl.LINE_STRIP, colors.target, identity);
    draw(scene.recovered, gl.POINTS, colors.recovered, identity, { diameter: scale * 3 });
    draw(scene.body, gl.TRIANGLES, colors.body, transform, { lighting: true });
    draw(scene.bearing, gl.POINTS, colors.surfaceMarker, transform, { diameter: scale * 7 });
    gl.bindBuffer(gl.ARRAY_BUFFER, scene.marker.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([
      contact[0] - ground.origin[0], contact[1] - ground.origin[1], scene.run.shape.radius * 0.009,
    ]));
    gl.disable(gl.DEPTH_TEST);
    draw(scene.marker, gl.POINTS, colors.contactRim, identity, { diameter: scale * 13 });
    draw(scene.marker, gl.POINTS, colors.recovered, identity, { diameter: scale * 8 });
  }

  return {
    render,
    dispose() {
      forgetScene();
      gl.deleteProgram(pipeline);
    },
  };
}

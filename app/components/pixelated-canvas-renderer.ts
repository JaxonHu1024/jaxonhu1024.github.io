type PixelSample = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  color: string;
  drop: boolean;
  seed: number;
};

type CanvasDimensions = {
  width: number;
  height: number;
  cell: number;
  dot: number;
  columns: number;
  rows: number;
};

type PointerPosition = Readonly<{ x: number; y: number }>;

type PixelatedCanvasRendererOptions = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  cellSize: number;
  dotScale: number;
  shape: "circle" | "square";
  backgroundColor: string;
  grayscale: boolean;
  responsive: boolean;
  dropoutStrength: number;
  distortionStrength: number;
  distortionRadius: number;
  distortionMode: "repel" | "attract" | "swirl";
  sampleAverage: boolean;
  tintColor: string;
  tintStrength: number;
  objectFit: "cover" | "contain" | "fill" | "none";
  jitterStrength: number;
  jitterSpeed: number;
};

function parseColor(color: string): [number, number, number] | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const match = color.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i);
  return match
    ? [
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10),
        Number.parseInt(match[3], 10),
      ]
    : null;
}

function hash2D(x: number, y: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

export function createPixelatedCanvasRenderer({
  canvas,
  width,
  height,
  cellSize,
  dotScale,
  shape,
  backgroundColor,
  grayscale,
  responsive,
  dropoutStrength,
  distortionStrength,
  distortionRadius,
  distortionMode,
  sampleAverage,
  tintColor,
  tintStrength,
  objectFit,
  jitterStrength,
  jitterSpeed,
}: PixelatedCanvasRendererOptions) {
  let samples: PixelSample[] = [];
  let dimensions: CanvasDimensions | null = null;
  let baseLayer: HTMLCanvasElement | null = null;
  const affectedSamples: PixelSample[] = [];
  const affectedInfluences: number[] = [];
  const affectedDeltaX: number[] = [];
  const affectedDeltaY: number[] = [];

  const getDisplayDimensions = () => {
    if (!responsive) {
      return { width: Math.max(1, width), height: Math.max(1, height) };
    }

    const parentBounds = canvas.parentElement?.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(parentBounds?.width || width)),
      height: Math.max(1, Math.round(parentBounds?.height || height)),
    };
  };

  const clearCanvas = (
    context: CanvasRenderingContext2D,
    currentDimensions: CanvasDimensions,
  ) => {
    context.globalAlpha = 1;
    if (backgroundColor) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, currentDimensions.width, currentDimensions.height);
    } else {
      context.clearRect(0, 0, currentDimensions.width, currentDimensions.height);
    }
  };

  const paintSample = (
    context: CanvasRenderingContext2D,
    sample: PixelSample,
    drawX: number,
    drawY: number,
    currentDimensions: CanvasDimensions,
    opacity = 1,
  ) => {
    const alpha = sample.a * opacity;
    if (alpha <= 0) return;

    context.globalAlpha = alpha;
    context.fillStyle = sample.color;
    if (shape === "circle") {
      context.beginPath();
      context.arc(drawX, drawY, currentDimensions.dot / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(
        drawX - currentDimensions.dot / 2,
        drawY - currentDimensions.dot / 2,
        currentDimensions.dot,
        currentDimensions.dot,
      );
    }
  };

  const drawBaseLayer = (
    context: CanvasRenderingContext2D,
    currentDimensions: CanvasDimensions,
  ) => {
    context.globalAlpha = 1;
    if (!baseLayer) {
      clearCanvas(context, currentDimensions);
      for (const sample of samples) {
        paintSample(
          context,
          sample,
          sample.x + currentDimensions.cell / 2,
          sample.y + currentDimensions.cell / 2,
          currentDimensions,
        );
      }
      context.globalAlpha = 1;
      return;
    }

    if (!backgroundColor) {
      context.clearRect(0, 0, currentDimensions.width, currentDimensions.height);
    }
    context.drawImage(
      baseLayer,
      0,
      0,
      baseLayer.width,
      baseLayer.height,
      0,
      0,
      currentDimensions.width,
      currentDimensions.height,
    );
  };

  const draw = (now: number, activity: number, pointer: PointerPosition) => {
    const context = canvas.getContext("2d");
    if (!context || !dimensions) return;

    drawBaseLayer(context, dimensions);
    if (activity <= 0) return;

    const radius = Math.max(1, distortionRadius);
    const radiusSquared = radius * radius;
    const jitterTime = now * 0.001 * jitterSpeed;
    const startColumn = Math.max(0, Math.floor((pointer.x - radius) / dimensions.cell));
    const endColumn = Math.min(
      dimensions.columns - 1,
      Math.ceil((pointer.x + radius) / dimensions.cell),
    );
    const startRow = Math.max(0, Math.floor((pointer.y - radius) / dimensions.cell));
    const endRow = Math.min(
      dimensions.rows - 1,
      Math.ceil((pointer.y + radius) / dimensions.cell),
    );
    let affectedCount = 0;

    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        const sample = samples[row * dimensions.columns + column];
        if (!sample || sample.a <= 0) continue;

        const centerX = sample.x + dimensions.cell / 2;
        const centerY = sample.y + dimensions.cell / 2;
        const deltaX = centerX - pointer.x;
        const deltaY = centerY - pointer.y;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared > radiusSquared) continue;

        const normalizedDistance = 1 - distanceSquared / radiusSquared;
        const influence = (
          normalizedDistance
          * normalizedDistance
          * (3 - 2 * normalizedDistance)
          * activity
        );
        if (influence <= 0.0005) continue;

        affectedSamples[affectedCount] = sample;
        affectedInfluences[affectedCount] = influence;
        affectedDeltaX[affectedCount] = deltaX;
        affectedDeltaY[affectedCount] = deltaY;
        affectedCount += 1;
      }
    }

    context.globalAlpha = 1;
    if (backgroundColor) context.fillStyle = backgroundColor;
    for (let index = 0; index < affectedCount; index += 1) {
      const sample = affectedSamples[index];
      const centerX = sample.x + dimensions.cell / 2;
      const centerY = sample.y + dimensions.cell / 2;
      if (backgroundColor) {
        context.fillRect(
          centerX - dimensions.dot / 2,
          centerY - dimensions.dot / 2,
          dimensions.dot,
          dimensions.dot,
        );
      } else {
        context.clearRect(
          centerX - dimensions.dot / 2,
          centerY - dimensions.dot / 2,
          dimensions.dot,
          dimensions.dot,
        );
      }
    }

    for (let index = 0; index < affectedCount; index += 1) {
      const sample = affectedSamples[index];
      const influence = affectedInfluences[index];
      const deltaX = affectedDeltaX[index];
      const deltaY = affectedDeltaY[index];
      let drawX = sample.x + dimensions.cell / 2;
      let drawY = sample.y + dimensions.cell / 2;

      if (distortionMode === "swirl") {
        const angle = distortionStrength * 0.05 * influence;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        drawX = pointer.x + cosine * deltaX - sine * deltaY;
        drawY = pointer.y + sine * deltaX + cosine * deltaY;
      } else {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) + 0.0001;
        const direction = distortionMode === "repel" ? 1 : -1;
        drawX += direction * (deltaX / distance) * distortionStrength * influence;
        drawY += direction * (deltaY / distance) * distortionStrength * influence;
      }

      if (jitterStrength > 0) {
        const phase = sample.seed * 43758.5453;
        drawX += Math.sin(jitterTime + phase) * jitterStrength * influence;
        drawY += Math.cos(jitterTime + phase * 1.13) * jitterStrength * influence;
      }

      paintSample(
        context,
        sample,
        drawX,
        drawY,
        dimensions,
        sample.drop ? 1 - influence : 1,
      );
    }
    context.globalAlpha = 1;
  };

  const computeSamples = (image: HTMLImageElement) => {
    if (!image.naturalWidth || !image.naturalHeight) return false;

    const display = getDisplayDimensions();
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const sampleCell = Math.max(1, Math.round(cellSize));
    canvas.width = Math.max(1, Math.floor(display.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(display.height * devicePixelRatio));
    canvas.style.width = `${display.width}px`;
    canvas.style.height = `${display.height}px`;

    const context = canvas.getContext("2d");
    if (!context) return false;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const offscreen = document.createElement("canvas");
    offscreen.width = Math.max(1, Math.floor(display.width));
    offscreen.height = Math.max(1, Math.floor(display.height));
    const offscreenContext = offscreen.getContext("2d", { willReadFrequently: true });
    if (!offscreenContext) return false;

    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    let drawWidth = display.width;
    let drawHeight = display.height;
    let drawX = 0;
    let drawY = 0;

    if (objectFit === "cover" || objectFit === "contain") {
      const scale = objectFit === "cover"
        ? Math.max(display.width / imageWidth, display.height / imageHeight)
        : Math.min(display.width / imageWidth, display.height / imageHeight);
      drawWidth = Math.ceil(imageWidth * scale);
      drawHeight = Math.ceil(imageHeight * scale);
      drawX = Math.floor((display.width - drawWidth) / 2);
      drawY = Math.floor((display.height - drawHeight) / 2);
    } else if (objectFit === "none") {
      drawWidth = imageWidth;
      drawHeight = imageHeight;
      drawX = Math.floor((display.width - drawWidth) / 2);
      drawY = Math.floor((display.height - drawHeight) / 2);
    }

    offscreenContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    let imageData: ImageData;
    try {
      imageData = offscreenContext.getImageData(0, 0, offscreen.width, offscreen.height);
    } catch {
      context.drawImage(image, 0, 0, display.width, display.height);
      return false;
    }

    const data = imageData.data;
    const stride = offscreen.width * 4;
    const tint = tintStrength > 0 ? parseColor(tintColor) : null;
    const nextSamples: PixelSample[] = [];
    const luminanceAt = (x: number, y: number) => {
      const sampleX = Math.max(0, Math.min(offscreen.width - 1, x));
      const sampleY = Math.max(0, Math.min(offscreen.height - 1, y));
      const index = sampleY * stride + sampleX * 4;
      return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    };

    for (let y = 0; y < offscreen.height; y += sampleCell) {
      const centerY = Math.min(offscreen.height - 1, y + Math.floor(sampleCell / 2));
      for (let x = 0; x < offscreen.width; x += sampleCell) {
        const centerX = Math.min(offscreen.width - 1, x + Math.floor(sampleCell / 2));
        let red = 0;
        let green = 0;
        let blue = 0;
        let alpha = 0;

        if (sampleAverage) {
          let count = 0;
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              const sampleX = Math.max(0, Math.min(offscreen.width - 1, centerX + offsetX));
              const sampleY = Math.max(0, Math.min(offscreen.height - 1, centerY + offsetY));
              const index = sampleY * stride + sampleX * 4;
              red += data[index];
              green += data[index + 1];
              blue += data[index + 2];
              alpha += data[index + 3] / 255;
              count += 1;
            }
          }
          red = Math.round(red / count);
          green = Math.round(green / count);
          blue = Math.round(blue / count);
          alpha /= count;
        } else {
          const index = centerY * stride + centerX * 4;
          red = data[index];
          green = data[index + 1];
          blue = data[index + 2];
          alpha = data[index + 3] / 255;
        }

        if (grayscale) {
          const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
          red = luminance;
          green = luminance;
          blue = luminance;
        } else if (tint) {
          const strength = Math.max(0, Math.min(1, tintStrength));
          red = Math.round(red * (1 - strength) + tint[0] * strength);
          green = Math.round(green * (1 - strength) + tint[1] * strength);
          blue = Math.round(blue * (1 - strength) + tint[2] * strength);
        }

        const centerLuminance = luminanceAt(centerX, centerY);
        const left = luminanceAt(centerX - 1, centerY);
        const right = luminanceAt(centerX + 1, centerY);
        const top = luminanceAt(centerX, centerY - 1);
        const bottom = luminanceAt(centerX, centerY + 1);
        const gradient =
          Math.abs(right - left)
          + Math.abs(bottom - top)
          + Math.abs(centerLuminance - (left + right + top + bottom) / 4);
        const gradientStrength = Math.max(0, Math.min(1, gradient / 255));
        const dropoutProbability = Math.max(
          0,
          Math.min(1, (1 - gradientStrength) * dropoutStrength),
        );

        nextSamples.push({
          x,
          y,
          r: red,
          g: green,
          b: blue,
          a: alpha,
          color: `rgb(${red}, ${green}, ${blue})`,
          drop: hash2D(centerX, centerY) < dropoutProbability,
          seed: hash2D(centerX, centerY),
        });
      }
    }

    dimensions = {
      width: display.width,
      height: display.height,
      cell: sampleCell,
      dot: Math.max(1, sampleCell * Math.max(0, Math.min(1, dotScale))),
      columns: Math.ceil(offscreen.width / sampleCell),
      rows: Math.ceil(offscreen.height / sampleCell),
    };
    samples = nextSamples;

    const nextBaseLayer = document.createElement("canvas");
    nextBaseLayer.width = canvas.width;
    nextBaseLayer.height = canvas.height;
    const baseContext = nextBaseLayer.getContext("2d");
    if (baseContext) {
      baseContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      clearCanvas(baseContext, dimensions);
      for (const sample of samples) {
        paintSample(
          baseContext,
          sample,
          sample.x + dimensions.cell / 2,
          sample.y + dimensions.cell / 2,
          dimensions,
        );
      }
      baseContext.globalAlpha = 1;
      baseLayer = nextBaseLayer;
    } else {
      baseLayer = null;
    }

    return true;
  };

  return { computeSamples, draw };
}

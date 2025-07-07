class NinePatch {
    async scaleImage(
        srcImg,
        width, height, // Design-based target width & height (in design units)
        fromNinePatchImageEditor = false,
        designWidth = 1440,
        designHeight = 2560,
        targetWidth = 1080,
        targetHeight = 1920
    ) {
        const image = await this.loadImage(srcImg);

        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);

        const stretchRegions = this.getStretchRegions(ctx, image.width, image.height);

        if (!fromNinePatchImageEditor) {
            width *= 4;
            height *= 4;
        }

        // Calculate scaling factor from design resolution → target resolution
        const scaleX = targetWidth / designWidth;
        const scaleY = targetHeight / designHeight;

        const scaledWidth = Math.round(width * scaleX);
        const scaledHeight = Math.round(height * scaleY);

        const contentCanvas = document.createElement("canvas");
        contentCanvas.width = image.width - 2;
        contentCanvas.height = image.height - 2;
        const contentCtx = contentCanvas.getContext("2d");
        contentCtx.drawImage(
            canvas,
            1,
            1,
            image.width - 2,
            image.height - 2,
            0,
            0,
            image.width - 2,
            image.height - 2
        );

        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = scaledWidth;
        outputCanvas.height = scaledHeight;
        const outCtx = outputCanvas.getContext("2d");

        const regions = this.splitRegions(contentCanvas.width, contentCanvas.height, stretchRegions);

        const fixedWidth = this.totalSize(regions.cols.filter(r => !r.stretch));
        const fixedHeight = this.totalSize(regions.rows.filter(r => !r.stretch));
        const stretchWidth = Math.max(scaledWidth - fixedWidth, 0);
        const stretchHeight = Math.max(scaledHeight - fixedHeight, 0);
        const totalStretchWidth = this.totalSize(regions.cols.filter(r => r.stretch));
        const totalStretchHeight = this.totalSize(regions.rows.filter(r => r.stretch));

        const colWidths = regions.cols.map(col => {
            if (col.stretch) {
                return totalStretchWidth > 0
                    ? Math.round((col.size * stretchWidth) / totalStretchWidth)
                    : 0;
            }
            return col.size;
        });

        const rowHeights = regions.rows.map(row => {
            if (row.stretch) {
                return totalStretchHeight > 0
                    ? Math.round((row.size * stretchHeight) / totalStretchHeight)
                    : 0;
            }
            return row.size;
        });

        const sumColWidths = colWidths.reduce((a, b) => a + b, 0);
        colWidths[colWidths.length - 1] += scaledWidth - sumColWidths;

        const sumRowHeights = rowHeights.reduce((a, b) => a + b, 0);
        rowHeights[rowHeights.length - 1] += scaledHeight - sumRowHeights;

        let destY = 0;
        for (let rowIndex = 0; rowIndex < regions.rows.length; rowIndex++) {
            const row = regions.rows[rowIndex];
            const rowHeight = rowHeights[rowIndex];
            let destX = 0;
            for (let colIndex = 0; colIndex < regions.cols.length; colIndex++) {
                const col = regions.cols[colIndex];
                const colWidth = colWidths[colIndex];

                const sx = col.start;
                const sy = row.start;
                const sw = col.size;
                const sh = row.size;
                const dx = destX;
                const dy = destY;
                const dw = colWidth;
                const dh = rowHeight;

                outCtx.drawImage(contentCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
                destX += colWidth;
            }
            destY += rowHeight;
        }

        return outputCanvas.toDataURL();
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            if (src instanceof Blob) {
                src = URL.createObjectURL(src);
            }
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    getStretchRegions(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const top = this.readBlackSegments(imageData, 1, 0, width - 2, "x");
        const left = this.readBlackSegments(imageData, 0, 1, height - 2, "y");
        return { top, left };
    }

    readBlackSegments(imageData, startX, startY, length, axis) {
        const segments = [];
        let inBlack = false;
        let segStart = 0;
        for (let i = 0; i < length; i++) {
            const x = axis === "x" ? startX + i : startX;
            const y = axis === "y" ? startY + i : startY;
            const index = (y * imageData.width + x) * 4;
            const r = imageData.data[index];
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];
            const a = imageData.data[index + 3];
            const isBlack = r === 0 && g === 0 && b === 0 && a === 255;
            if (isBlack && !inBlack) {
                segStart = i;
                inBlack = true;
            } else if (!isBlack && inBlack) {
                segments.push([segStart, i - 1]);
                inBlack = false;
            }
        }
        if (inBlack) {
            segments.push([segStart, length - 1]);
        }
        return segments;
    }

    splitRegions(contentWidth, contentHeight, stretchRegions) {
        const rows = this.splitAxis(contentHeight, stretchRegions.left);
        const cols = this.splitAxis(contentWidth, stretchRegions.top);
        return { rows, cols };
    }

    splitAxis(size, stretchSegments) {
        const regions = [];
        let last = 0;
        for (const [start, end] of stretchSegments) {
            if (start > last) {
                regions.push({ start: last, size: start - last, stretch: false });
            }
            regions.push({ start, size: end - start + 1, stretch: true });
            last = end + 1;
        }
        if (last < size) {
            regions.push({ start: last, size: size - last, stretch: false });
        }
        return regions;
    }

    totalSize(regions) {
        return regions.reduce((acc, r) => acc + r.size, 0);
    }
}

// Export the NinePatch class for use in other modules
export { NinePatch };
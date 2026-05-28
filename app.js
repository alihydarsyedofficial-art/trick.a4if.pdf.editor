pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// App State Management
const EngineState = {
    pdfJsDoc: null,
    pdfBytesOriginal: null,
    currentPage: 1,
    totalPages: 0,
    fabricCanvas: null,
    annotationsData: {}, 
    activeTool: null
};

// UI References
const UI = {
    upload: document.getElementById('pdf-upload'),
    bgCanvas: document.getElementById('pdf-bg-canvas'),
    wrapper: document.getElementById('canvas-wrapper'),
    emptyState: document.getElementById('empty-state'),
    toolsGroup: document.getElementById('main-tools'),
    exportBtn: document.getElementById('btn-export'),
    loader: document.getElementById('loader'),
    loaderText: document.getElementById('loader-text'),
    toolBtns: document.querySelectorAll('.tool-btn[data-tool]')
};
const bgCtx = UI.bgCanvas.getContext('2d');

// --- Tool Automation Engine ---
function activateTool(toolName) {
    if (!EngineState.fabricCanvas) return;
    EngineState.activeTool = toolName;
    
    UI.toolBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tool-btn[data-tool="${toolName}"]`).classList.add('active');

    const fc = EngineState.fabricCanvas;
    fc.isDrawingMode = false;
    fc.defaultCursor = 'default';

    switch(toolName) {
        case 'draw':
            fc.isDrawingMode = true;
            fc.freeDrawingBrush.color = '#000000'; // Real pen color
            fc.freeDrawingBrush.width = 3;
            fc.freeDrawingCursor = 'crosshair';
            break;
        case 'highlight':
            fc.isDrawingMode = true;
            fc.freeDrawingBrush.color = 'rgba(255, 235, 59, 0.4)'; 
            fc.freeDrawingBrush.width = 25;
            fc.freeDrawingCursor = 'text';
            break;
        case 'text':
            fc.defaultCursor = 'text';
            break;
    }
}

// Auto-Text Generation on Click
UI.wrapper.addEventListener('click', (e) => {
    if (EngineState.activeTool === 'text' && EngineState.fabricCanvas) {
        if (EngineState.fabricCanvas.getActiveObject()) return;
        
        const pointer = EngineState.fabricCanvas.getPointer(e);
        const text = new fabric.IText('Start typing...', {
            left: pointer.x,
            top: pointer.y - 12,
            fontFamily: 'Helvetica',
            fontSize: 22,
            fill: '#06070a',
            editable: true,
            borderColor: '#00ffcc',
            cornerColor: '#00ffcc',
            transparentCorners: false
        });
        EngineState.fabricCanvas.add(text);
        EngineState.fabricCanvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
    }
});

// Auto Delete
window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && EngineState.fabricCanvas) {
        const activeObj = EngineState.fabricCanvas.getActiveObject();
        if (activeObj && !activeObj.isEditing) {
            EngineState.fabricCanvas.remove(activeObj);
        }
    }
});

// --- Zero-Distortion Canvas Engine ---
function initFabricCanvas(width, height) {
    if (EngineState.fabricCanvas) {
        EngineState.annotationsData[EngineState.currentPage] = EngineState.fabricCanvas.toJSON();
        EngineState.fabricCanvas.dispose();
    }
    
    // Explicitly set wrapper size to match exactly to prevent flexbox from squishing it
    UI.wrapper.style.width = `${width}px`;
    UI.wrapper.style.height = `${height}px`;
    
    const interactCanvas = document.getElementById('interactive-canvas');
    interactCanvas.width = width;
    interactCanvas.height = height;
    
    EngineState.fabricCanvas = new fabric.Canvas('interactive-canvas', { width, height });

    if (EngineState.annotationsData[EngineState.currentPage]) {
        EngineState.fabricCanvas.loadFromJSON(
            EngineState.annotationsData[EngineState.currentPage], 
            EngineState.fabricCanvas.renderAll.bind(EngineState.fabricCanvas)
        );
    }

    if (EngineState.activeTool) activateTool(EngineState.activeTool);
}

UI.upload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        UI.loader.classList.remove('hidden');
        UI.emptyState.classList.add('hidden');
        UI.loaderText.textContent = "DECRYPTING LAYOUT...";
        
        EngineState.pdfBytesOriginal = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: EngineState.pdfBytesOriginal });
        EngineState.pdfJsDoc = await loadingTask.promise;
        
        EngineState.totalPages = EngineState.pdfJsDoc.numPages;
        EngineState.currentPage = 1;
        document.getElementById('page-count').textContent = EngineState.totalPages;
        
        await renderPage(EngineState.currentPage);
        
        UI.toolsGroup.classList.remove('disabled-group');
        UI.exportBtn.classList.remove('disabled-group');
        UI.loader.classList.add('hidden');
        UI.wrapper.classList.remove('hidden');
        
        activateTool('text'); // Default active tool
    }
});

async function renderPage(num) {
    document.getElementById('page-num').textContent = num;
    const page = await EngineState.pdfJsDoc.getPage(num);
    
    // Scale 1.5 maintains high-res quality and real document proportions
    const viewport = page.getViewport({ scale: 1.5 }); 
    
    UI.bgCanvas.width = viewport.width;
    UI.bgCanvas.height = viewport.height;
    
    await page.render({ canvasContext: bgCtx, viewport: viewport }).promise;
    initFabricCanvas(viewport.width, viewport.height);
}

// --- Controls Events ---
UI.toolBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTool(btn.dataset.tool));
});

document.getElementById('btn-prev').addEventListener('click', async () => {
    if (EngineState.currentPage <= 1) return;
    EngineState.currentPage--;
    await renderPage(EngineState.currentPage);
});

document.getElementById('btn-next').addEventListener('click', async () => {
    if (EngineState.currentPage >= EngineState.totalPages) return;
    EngineState.currentPage++;
    await renderPage(EngineState.currentPage);
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (EngineState.fabricCanvas) EngineState.fabricCanvas.clear();
});

// --- Data Baking & Export ---
UI.exportBtn.addEventListener('click', async () => {
    UI.loaderText.textContent = "BAKING TRICK A4IF DATA...";
    UI.loader.classList.remove('hidden');
    
    if (EngineState.fabricCanvas) {
        EngineState.annotationsData[EngineState.currentPage] = EngineState.fabricCanvas.toJSON();
    }

    try {
        const pdfDoc = await PDFLib.PDFDocument.load(EngineState.pdfBytesOriginal);
        const pages = pdfDoc.getPages();

        for (let i = 1; i <= EngineState.totalPages; i++) {
            if (EngineState.annotationsData[i]) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.id = 'temp-export';
                const tempFabric = new fabric.Canvas(tempCanvas.id, { width: UI.bgCanvas.width, height: UI.bgCanvas.height });

                await new Promise(resolve => {
                    tempFabric.loadFromJSON(EngineState.annotationsData[i], () => {
                        tempFabric.renderAll();
                        resolve();
                    });
                });

                if (tempFabric.getObjects().length > 0) {
                    const pngDataUrl = tempFabric.toDataURL({ format: 'png', multiplier: 1 });
                    const pngImageBytes = await fetch(pngDataUrl).then(res => res.arrayBuffer());
                    const pngImage = await pdfDoc.embedPng(pngImageBytes);
                    const pdfPage = pages[i - 1];
                    const { width, height } = pdfPage.getSize();
                    
                    pdfPage.drawImage(pngImage, { x: 0, y: 0, width: width, height: height });
                }
            }
        }

        const pdfBytesFinal = await pdfDoc.save();
        const blob = new Blob([pdfBytesFinal], { type: "application/pdf" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `TRICK_A4IF_Engine_Export.pdf`;
        link.click();

    } catch (error) {
        console.error(error);
        alert("Automation Engine Failed.");
    } finally {
        UI.loader.classList.add('hidden');
    }
});

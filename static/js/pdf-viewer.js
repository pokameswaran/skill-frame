/**
 * PDF Viewer Module
 * Integrates PDF.js for viewing PDF documents with navigation and zoom controls
 */

class PDFViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.pdfDoc = null;
    this.pageNum = 1;
    this.pageRendering = false;
    this.pageNumPending = null;
    this.scale = 1.0;
    this.canvas = null;
    this.ctx = null;
    
    this.init();
  }

  async init() {
    // Set up PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/build/pdf.worker.mjs';
    
    this.createUI();
    this.setupEventListeners();
  }

  createUI() {
    this.container.innerHTML = `
      <div class="pdf-viewer-container">
        <!-- PDF Viewer Header with Minimize Button -->
        <div class="pdf-viewer-header">
          <h3>📄 PDF Viewer</h3>
          <button type="button" id="pdfMinimizeButton" class="minimize-button" title="Minimize PDF viewer">
            ➖
          </button>
        </div>
        
        <!-- File Upload and Controls Section -->
        <div class="pdf-controls-top" id="pdfControlsTop">
          <div class="file-upload-section">
            <input type="file" id="pdfFileInput" accept=".pdf" style="display: none;">
            <button id="uploadBtn" class="pdf-btn primary">
              📁 Upload PDF
            </button>
            <span id="fileName" class="file-name"></span>
          </div>
          
          <!-- Navigation and Zoom Controls -->
          <div class="pdf-all-controls" id="pdfAllControls" style="display: none;">
            <div class="pdf-nav-controls">
              <button id="prevPageBtn" class="pdf-btn">⬅️ Previous</button>
              <span class="page-info">
                Page <input type="number" id="pageNumInput" min="1" max="1" value="1" class="page-input"> of <span id="pageCount">1</span>
              </span>
              <button id="nextPageBtn" class="pdf-btn">Next ➡️</button>
            </div>
            
            <div class="pdf-zoom-controls">
              <button id="zoomOutBtn" class="pdf-btn">🔍➖</button>
              <span class="zoom-info"><span id="zoomLevel">100</span>%</span>
              <button id="zoomInBtn" class="pdf-btn">🔍➕</button>
              <button id="fitWidthBtn" class="pdf-btn">📐 Fit Width</button>
            </div>
          </div>
        </div>

        <!-- PDF Display Area with Scrolling -->
        <div class="pdf-display-area" id="pdfDisplayArea">
          <div id="pdfLoadingMessage" class="pdf-message">
            <h3>📄 Ready to View PDFs</h3>
            <p>Upload a PDF file to get started</p>
          </div>
          <div class="pdf-canvas-container" style="display: none;">
            <div class="pdf-page-container">
              <canvas id="pdfCanvas"></canvas>
              <div id="pdfTextLayer" class="pdf-text-layer"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Get canvas and context
    this.canvas = document.getElementById('pdfCanvas');
    this.ctx = this.canvas.getContext('2d');
  }

  setupEventListeners() {
    // File upload
    document.getElementById('uploadBtn').addEventListener('click', () => {
      document.getElementById('pdfFileInput').click();
    });

    document.getElementById('pdfFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && file.type === 'application/pdf') {
        this.loadPDF(file);
      }
    });

    // Minimize button
    document.getElementById('pdfMinimizeButton').addEventListener('click', () => {
      // Call the global toggle function to hide the PDF viewer
      if (window.togglePdfViewer) {
        window.togglePdfViewer();
      }
    });

    // Navigation controls
    document.getElementById('prevPageBtn').addEventListener('click', () => {
      this.prevPage();
    });

    document.getElementById('nextPageBtn').addEventListener('click', () => {
      this.nextPage();
    });

    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      this.zoomIn();
    });

    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      this.zoomOut();
    });

    document.getElementById('fitWidthBtn').addEventListener('click', () => {
      this.fitToWidth();
    });

    // Page number input
    const pageInput = document.getElementById('pageNumInput');
    pageInput.addEventListener('change', (e) => {
      this.goToPage(parseInt(e.target.value));
    });

    pageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.goToPage(parseInt(e.target.value));
        e.target.blur(); // Remove focus after navigation
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.pdfDoc) {
        switch(e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            this.prevPage();
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.nextPage();
            break;
          case '=':
          case '+':
            if (e.ctrlKey) {
              e.preventDefault();
              this.zoomIn();
            }
            break;
          case '-':
            if (e.ctrlKey) {
              e.preventDefault();
              this.zoomOut();
            }
            break;
        }
      }
    });
  }

  async loadPDF(file) {
    try {
      document.getElementById('pdfLoadingMessage').innerHTML = `
        <h3>📄 Loading PDF...</h3>
        <p>Please wait while we load your document</p>
      `;

      const arrayBuffer = await file.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
      
      // Update UI
      document.getElementById('fileName').textContent = file.name;
      document.getElementById('pageCount').textContent = this.pdfDoc.numPages;
      document.getElementById('pageNumInput').max = this.pdfDoc.numPages;
      document.getElementById('pdfLoadingMessage').style.display = 'none';
      document.querySelector('.pdf-canvas-container').style.display = 'flex';
      document.getElementById('pdfAllControls').style.display = 'flex';
      
      // Reset to first page
      this.pageNum = 1;
      this.renderPage(this.pageNum);
      this.updateNavigationState();

      console.log('PDF loaded successfully:', file.name, 'Pages:', this.pdfDoc.numPages);
      
    } catch (error) {
      console.error('Error loading PDF:', error);
      document.getElementById('pdfLoadingMessage').innerHTML = `
        <h3>❌ Error Loading PDF</h3>
        <p>Failed to load the PDF file. Please try again with a different file.</p>
      `;
    }
  }

  async renderPage(num) {
    if (this.pageRendering) {
      this.pageNumPending = num;
      return;
    }
    
    this.pageRendering = true;

    try {
      const page = await this.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: this.scale });
      
      // Set canvas dimensions
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      // Render the page on canvas
      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      
      // Render text layer for selection
      await this.renderTextLayer(page, viewport);
      
      this.pageRendering = false;
      
      // Update page number display
      document.getElementById('pageNumInput').value = num;
      
      // If there was a pending page render, do it now
      if (this.pageNumPending !== null) {
        this.renderPage(this.pageNumPending);
        this.pageNumPending = null;
      }

    } catch (error) {
      console.error('Error rendering page:', error);
      this.pageRendering = false;
    }
  }

  async renderTextLayer(page, viewport) {
    const textLayerDiv = document.getElementById('pdfTextLayer');
    
    // Clear previous text layer
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    
    try {
      // Get text content
      const textContent = await page.getTextContent();
      
      // Use manual implementation with proper coordinate transformation
      textContent.items.forEach((textItem, index) => {
        const textDiv = document.createElement('span');
        textDiv.textContent = textItem.str;
        textDiv.style.position = 'absolute';
        
        // Get the transformation matrix
        const transform = textItem.transform;
        
        // Extract coordinates from transform matrix (in PDF user space)
        const userX = transform[4];
        const userY = transform[5];
        const scaleX = transform[0];
        const scaleY = transform[3];
        const userFontSize = Math.abs(scaleY); // Use scaleY for more accurate font size
        
        // Convert from PDF user space to viewport space using the viewport
        const viewportPoint = viewport.convertToViewportPoint(userX, userY);
        const viewportX = viewportPoint[0];
        const viewportY = viewportPoint[1];
        
        // Scale the font size
        const viewportFontSize = userFontSize * viewport.scale;
        
        // Fine-tune the Y position - move up slightly to better align with PDF text
        const adjustedY = viewportY - (viewportFontSize * 0.66);
        
        // Position the text element
        textDiv.style.left = viewportX + 'px';
        textDiv.style.top = adjustedY + 'px';
        textDiv.style.fontSize = viewportFontSize + 'px';
        textDiv.style.lineHeight = '1.0'; // Ensure consistent line height
        
        // Handle text scaling
        if (Math.abs(scaleX) !== Math.abs(scaleY)) {
          const scaleRatio = scaleX / scaleY;
          textDiv.style.transform = `scaleX(${scaleRatio})`;
        }
        
        textDiv.style.fontFamily = textItem.fontName || 'sans-serif';
        textDiv.style.color = 'transparent';
        textDiv.style.cursor = 'text';
        textDiv.style.userSelect = 'text';
        textDiv.style.webkitUserSelect = 'text';
        textDiv.style.mozUserSelect = 'text';
        textDiv.style.msUserSelect = 'text';
        textDiv.style.whiteSpace = 'pre';
        textDiv.style.transformOrigin = '0% 0%';
        textDiv.style.pointerEvents = 'auto';
        
        textLayerDiv.appendChild(textDiv);
      });
      
    } catch (error) {
      console.error('Error rendering text layer:', error);
    }
  }

  prevPage() {
    if (this.pageNum <= 1) return;
    this.pageNum--;
    this.renderPage(this.pageNum);
    this.updateNavigationState();
  }

  nextPage() {
    if (this.pageNum >= this.pdfDoc.numPages) return;
    this.pageNum++;
    this.renderPage(this.pageNum);
    this.updateNavigationState();
  }

  updateNavigationState() {
    document.getElementById('prevPageBtn').disabled = this.pageNum <= 1;
    document.getElementById('nextPageBtn').disabled = this.pageNum >= this.pdfDoc.numPages;
  }

  zoomIn() {
    this.scale *= 1.2;
    this.updateZoom();
  }

  zoomOut() {
    this.scale /= 1.2;
    this.updateZoom();
  }

  fitToWidth() {
    if (!this.pdfDoc) return;
    
    const containerWidth = this.container.querySelector('.pdf-display-area').clientWidth - 40; // Account for padding
    this.pdfDoc.getPage(this.pageNum).then(page => {
      const viewport = page.getViewport({ scale: 1.0 });
      this.scale = Math.min(containerWidth / viewport.width, 2.0); // Cap at 200% zoom
      this.updateZoom();
    });
  }

  updateZoom() {
    if (this.pdfDoc) {
      this.renderPage(this.pageNum);
      document.getElementById('zoomLevel').textContent = Math.round(this.scale * 100);
    }
  }

  // Public method to get current page text (for AI integration later)
  async getCurrentPageText() {
    if (!this.pdfDoc) return '';
    
    try {
      const page = await this.pdfDoc.getPage(this.pageNum);
      const textContent = await page.getTextContent();
      return textContent.items.map(item => item.str).join(' ');
    } catch (error) {
      console.error('Error extracting text:', error);
      return '';
    }
  }

  // Public method to get PDF info
  getPDFInfo() {
    if (!this.pdfDoc) return null;
    
    return {
      numPages: this.pdfDoc.numPages,
      currentPage: this.pageNum,
      scale: this.scale,
      fileName: document.getElementById('fileName').textContent
    };
  }

  goToPage(num) {
    if (!this.pdfDoc) return;
    
    // Validate page number
    if (isNaN(num) || num < 1 || num > this.pdfDoc.numPages) {
      // Reset input to current page if invalid
      document.getElementById('pageNumInput').value = this.pageNum;
      return;
    }
    
    this.pageNum = num;
    this.renderPage(this.pageNum);
    this.updateNavigationState();
  }
}

// Export for use in main app
window.PDFViewer = PDFViewer; 
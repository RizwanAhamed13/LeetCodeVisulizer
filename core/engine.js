/**
 * core/engine.js
 * Universal Visualization Engine for LeetCode Visualizer
 * Handles layout creation, resizable panes, playback states, and zoom/pan canvases.
 */

class VizEngine {
    constructor(config) {
        this.title = config.title || "Visualizer";
        this.badge = config.badge || "Visualization";
        this.tag = config.tag || "Algorithm";

        // Input Controls
        this.inputs = config.inputs || []; // [{id, label, default, width}]

        // Code
        this.codeLines = config.codeLines || [];

        // Callbacks
        this.onRun = config.onRun || function () { };
        this.onRenderStep = config.onRenderStep || function (step, wrapContainer) { };

        // State Machine
        this.steps = [];
        this.currentStep = 0;
        this.isPlaying = false;
        this.playInterval = null;
        this.zoomStates = new Map(); // tracks pan/zoom per container id
    }

    /**
     * Mounts the base HTML structure into document.body
     */
    init() {
        document.body.innerHTML = '';

        // 1. Header
        const header = document.createElement('div');
        header.className = 'header';
        header.innerHTML = `
            <a href="../../index.html" class="back-btn">← Home</a>
            <span class="badge">${this.badge}</span>
            <h1>${this.title}</h1>
            <span class="tag">${this.tag}</span>
        `;
        document.body.appendChild(header);

        // 2. Controls Bar
        const controls = document.createElement('div');
        controls.className = 'controls-bar';

        let inputsHtml = '';
        this.inputs.forEach(inp => {
            const w = inp.width || '140px';
            inputsHtml += `
            <div class="input-group">
                <label for="${inp.id}">${inp.label}</label>
                <input type="text" id="${inp.id}" value="${inp.default}" style="width: ${w};">
            </div>`;
        });

        controls.innerHTML = `
            ${inputsHtml}
            <button class="btn btn-run" id="engineRunBtn">▶ Run</button>
            <div class="playback">
                <button id="engineStart" title="First step">⏮</button>
                <button id="enginePrev" title="Previous">◀</button>
                <button id="enginePlayPause" title="Play / Pause">▶</button>
                <button id="engineNext" title="Next">▶</button>
                <button id="engineEnd" title="Last step">⏭</button>
            </div>
            <div class="speed-group">
                <label for="engineSpeed">Speed</label>
                <input type="range" class="speed-slider" id="engineSpeed" min="200" max="2500" value="1000" step="100">
            </div>
            <div class="step-info">Step <span id="engineStepCur">0</span> / <span id="engineStepTot">0</span></div>
        `;
        document.body.appendChild(controls);

        // 3. Main Split Area
        const mainSplit = document.createElement('div');
        mainSplit.className = 'main-split';

        // Code Pane
        const codePane = document.createElement('div');
        codePane.className = 'pane code-pane';
        codePane.id = 'engineCodePane';
        codePane.innerHTML = `
            <div class="code-title">
                <span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span>
                Solution.java
            </div>
            <div class="code-panel" id="engineCodePanel">
                <div class="code-lines" id="engineCodeLines"></div>
            </div>
        `;

        // Resizer handler
        const resizer = document.createElement('div');
        resizer.className = 'resizer';
        resizer.id = 'engineResizer';

        // Viz Pane
        const vizPane = document.createElement('div');
        vizPane.className = 'pane viz-pane';
        vizPane.id = 'engineVizPane';
        vizPane.innerHTML = `
            <div class="welcome" id="engineWelcome">
                <div class="welcome-icon">⚡</div>
                <h2>${this.title} Visualizer</h2>
                <p>Fill out the input fields and click <strong>Run</strong> to watch the interactive dry-run step-by-step.</p>
            </div>
        `;

        mainSplit.appendChild(codePane);
        mainSplit.appendChild(resizer);
        mainSplit.appendChild(vizPane);
        document.body.appendChild(mainSplit);

        // Bind Resizer Logic
        this._bindResizer(resizer, codePane, mainSplit);

        // Bind Playback Events
        document.getElementById('engineRunBtn').addEventListener('click', () => this.run());
        document.getElementById('engineStart').addEventListener('click', () => this.goTo(0));
        document.getElementById('enginePrev').addEventListener('click', () => this.prev());
        document.getElementById('engineNext').addEventListener('click', () => this.next());
        document.getElementById('engineEnd').addEventListener('click', () => this.goTo(this.steps.length - 1));
        document.getElementById('enginePlayPause').addEventListener('click', () => this.togglePlay());

        const speedSlider = document.getElementById('engineSpeed');
        speedSlider.addEventListener('input', () => {
            if (this.isPlaying) {
                this.stopPlay();
                this.startPlay();
            }
        });

        // "Enter" keys on inputs trigger run
        this.inputs.forEach(inp => {
            document.getElementById(inp.id).addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.run();
            });
        });

        // Initial Code Render
        this._renderCodeBlock();
    }

    _bindResizer(resizer, leftPane, container) {
        let isDragging = false;

        resizer.addEventListener('mousedown', (e) => {
            isDragging = true;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const containerRect = container.getBoundingClientRect();
            let newWidth = e.clientX - containerRect.left;

            // Constrain width
            if (newWidth < 250) newWidth = 250;
            if (newWidth > containerRect.width - 300) newWidth = containerRect.width - 300;

            leftPane.style.width = `${newWidth}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                resizer.classList.remove('dragging');
                document.body.style.cursor = 'default';
            }
        });
    }

    _renderCodeBlock() {
        const c = document.getElementById('engineCodeLines');
        c.innerHTML = '';
        this.codeLines.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'code-line';
            div.id = `cl-${i}`;
            const num = document.createElement('span');
            num.className = 'line-num';
            num.textContent = i + 1;
            div.appendChild(num);

            const content = document.createElement('span');
            content.className = 'line-content';
            content.innerHTML = line.tokens.length ? line.tokens.map(t => t.t ? `<span class="${t.t}">${t.v}</span>` : t.v).join('') : '&nbsp;';
            div.appendChild(content);
            c.appendChild(div);
        });
    }

    highlightLine(idx) {
        document.querySelectorAll('.code-line.active').forEach(e => e.classList.remove('active'));
        if (idx !== null && idx >= 0) {
            const el = document.getElementById(`cl-${idx}`);
            if (el) {
                el.classList.add('active');
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }

    // --- PLAYBACK ENGINE ---

    run() {
        this.stopPlay();
        // Invoke user callback to dynamically generate trace
        this.steps = this.onRun() || [];
        this.currentStep = 0;

        document.getElementById('engineWelcome').style.display = 'none';

        // Reset zoom states on new run
        this.zoomStates.clear();

        this.renderCurrentStep();
    }

    renderCurrentStep() {
        if (!this.steps || !this.steps.length) return;

        const step = this.steps[this.currentStep];

        // Update stats
        document.getElementById('engineStepCur').textContent = this.currentStep + 1;
        document.getElementById('engineStepTot').textContent = this.steps.length;

        // Highlight Code
        this.highlightLine(step.codeLine);

        // Clean up Viz panel
        const panel = document.getElementById('engineVizPane');
        panel.querySelectorAll('.viz-content').forEach(e => e.remove());

        // Wrapper for current step visualizations
        const wrap = document.createElement('div');
        wrap.className = 'viz-content animate-in';
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '20px';

        // Delegate specific rendering to the problem config
        this.onRenderStep(step, wrap, this);

        panel.appendChild(wrap);

        // Restore/Init Pan & Zoom for any canvas containers attached to this step
        this._initZoomCanvases();
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.renderCurrentStep();
        } else {
            this.stopPlay();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.renderCurrentStep();
        }
    }

    goTo(idx) {
        if (idx >= 0 && idx < this.steps.length) {
            this.currentStep = idx;
            this.renderCurrentStep();
        }
    }

    togglePlay() {
        this.isPlaying ? this.stopPlay() : this.startPlay();
    }

    startPlay() {
        if (!this.steps.length) return;
        this.isPlaying = true;
        const btn = document.getElementById('enginePlayPause');
        btn.textContent = '⏸';
        btn.classList.add('active');

        const spd = Number.parseInt(document.getElementById('engineSpeed').value);
        this.playInterval = setInterval(() => {
            this.next();
        }, spd);
    }

    stopPlay() {
        this.isPlaying = false;
        const btn = document.getElementById('enginePlayPause');
        btn.textContent = '▶';
        btn.classList.remove('active');
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    }

    // --- ZOOM & PAN ENGINE ---
    // User can wrap generic DOM elements inside <div class="zoomable-container" id="zc-1"><div class="zoomable-canvas">...</div></div>

    _initZoomCanvases() {
        const containers = document.querySelectorAll('.zoomable-container');
        containers.forEach(container => {
            const canvas = container.querySelector('.zoomable-canvas');
            if (!canvas) return;
            const cid = container.id;

            // Initialize or retrieve state
            if (!this.zoomStates.has(cid)) {
                this.zoomStates.set(cid, { scale: 1, translateX: 0, translateY: 0, isDragging: false, startX: 0, startY: 0 });
            }
            const state = this.zoomStates.get(cid);

            // Apply transforms immediately
            canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;

            // Prevent attaching multiple listeners if step re-renders (we use DOM replacement so usually fine, but safe to detach or bind once)
            container.onwheel = (e) => {
                e.preventDefault();
                const zoomIntensity = 0.05;
                const wheel = e.deltaY < 0 ? 1 : -1;
                let newScale = state.scale * Math.exp(wheel * zoomIntensity);

                // Limits
                if (newScale < 0.2) newScale = 0.2;
                if (newScale > 5) newScale = 5;

                // Zoom relative to pointer
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Adjust offset to keep mouse point fixed
                state.translateX = mouseX - (mouseX - state.translateX) * (newScale / state.scale);
                state.translateY = mouseY - (mouseY - state.translateY) * (newScale / state.scale);
                state.scale = newScale;

                canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
            };

            container.onmousedown = (e) => {
                state.isDragging = true;
                state.startX = e.clientX - state.translateX;
                state.startY = e.clientY - state.translateY;
                container.style.cursor = 'grabbing';
            };

            window.addEventListener('mouseup', () => {
                if (state.isDragging) {
                    state.isDragging = false;
                    container.style.cursor = 'grab';
                }
            }, { once: true }); // temporary listener

            window.addEventListener('mousemove', (e) => {
                if (!state.isDragging) return;
                state.translateX = e.clientX - state.startX;
                state.translateY = e.clientY - state.startY;
                canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
            });

            // Reattach generic mousemove to document but tied to this container's drag state
            container.onmousemove = (e) => {
                if (!state.isDragging) return;
                state.translateX = e.clientX - state.startX;
                state.translateY = e.clientY - state.startY;
                canvas.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
            }
            container.onmouseup = () => {
                state.isDragging = false;
                container.style.cursor = 'grab';
            }
            container.onmouseleave = () => {
                state.isDragging = false;
                container.style.cursor = 'grab';
            }
        });
    }

    // --- HELPER WRAPPER CREATOR ---
    createZoomableCard(id, labelHtml, innerHtml, defaultHeight = '300px') {
        return `
            <div class="viz-card">
                <div class="section-label">${labelHtml}</div>
                <div class="zoomable-container" id="${id}" style="height: ${defaultHeight}">
                    <div class="zoomable-canvas">
                        ${innerHtml}
                    </div>
                </div>
                <div style="font-size:10px; color:var(--text-dim); margin-top:8px; text-align:right;">
                    <em>Scroll to zoom, drag to pan. Drag bottom right to resize box.</em>
                </div>
            </div>
        `;
    }

    createSimpleCard(labelHtml, innerHtml) {
        return `
            <div class="viz-card">
                <div class="section-label">${labelHtml}</div>
                ${innerHtml}
            </div>
        `;
    }
}

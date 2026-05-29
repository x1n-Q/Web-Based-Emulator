// Main Application Entry Point

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const status = document.getElementById('status');
    const debug = document.getElementById('debug');
    const romFile = document.getElementById('romFile');
    const systemSelect = document.getElementById('systemSelect');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');
    const fullscreenHint = document.getElementById('fullscreenHint');
    const dismissHintBtn = document.getElementById('dismissHint');

    // Core managers
    const emulator = new EmulatorManager(canvas, ctx, status, debug);
    const inputHandler = new InputHandler(emulator);
    const controlSettings = new ControlSettings(inputHandler);
    const touchControls = new TouchControls(emulator, inputHandler);

    // Expose for cross-module visibility (used by emulator.setSystem hook)
    emulator.touchControls = touchControls;

    // Initial canvas
    emulator.initCanvas('nes');

    // -----------------------------------------------------------
    // Touch device & viewport detection
    // -----------------------------------------------------------
    const isTouchDevice = (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
                         || ('ontouchstart' in window);
    const isMobileViewport = () => window.innerWidth <= 768;

    function syncTouchOverlay() {
        // Show touch controls only when: touch device, NES selected, and either fullscreen-mode
        // is on OR we're on a mobile viewport. Hide for GBA (EmulatorJS has its own).
        if (!touchControls.container) return;
        const fsMode = document.body.classList.contains('fullscreen-mode');
        const shouldShow = isTouchDevice
                          && emulator.currentSystem === 'nes'
                          && (fsMode || isMobileViewport());
        if (shouldShow) touchControls.show();
        else touchControls.hide();
    }
    // Make it globally accessible so EmulatorManager.setSystem can call it
    window.__syncTouchOverlay = syncTouchOverlay;

    // -----------------------------------------------------------
    // System selection
    // -----------------------------------------------------------
    systemSelect.addEventListener('change', (e) => {
        const system = e.target.value;
        emulator.setSystem(system);
        status.textContent = `System: ${systemSelect.options[systemSelect.selectedIndex].text} - Load a ROM file`;
        syncTouchOverlay();
    });

    // -----------------------------------------------------------
    // ROM loader
    // -----------------------------------------------------------
    romFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        status.textContent = 'Loading ROM...';
        emulator.log('Reading ROM file...');

        try {
            emulator.stop();

            if (emulator.currentSystem === 'nes') {
                await emulator.loadNES(file);
            } else if (emulator.currentSystem === 'gba') {
                await emulator.loadGBA(file);
            }

            syncTouchOverlay();

            // Nudge the user to fullscreen after first successful load (mobile only)
            if (isTouchDevice && !localStorage.getItem('hintDismissed')) {
                showHint();
            }
        } catch (err) {
            emulator.log('ERROR: ' + err.message);
            status.textContent = 'Error: ' + err.message;
            console.error(err);
        }
    });

    // -----------------------------------------------------------
    // Fullscreen / "play mode"
    // -----------------------------------------------------------
    function enterPlayMode() {
        document.body.classList.add('fullscreen-mode');
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (req) {
            req.call(el).catch(() => { /* user gesture or browser blocked it — CSS mode still active */ });
        }
        syncTouchOverlay();
        // Note: we intentionally do NOT lock orientation — let the user rotate freely.
    }

    function exitPlayMode() {
        document.body.classList.remove('fullscreen-mode');
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
            const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (fn) fn.call(document).catch(() => {});
        }
        syncTouchOverlay();
    }

    function togglePlayMode() {
        if (document.body.classList.contains('fullscreen-mode')) exitPlayMode();
        else enterPlayMode();
    }

    fullscreenBtn.addEventListener('click', togglePlayMode);
    exitFullscreenBtn.addEventListener('click', exitPlayMode);

    // Keep our CSS class in sync if user exits via gesture / ESC
    document.addEventListener('fullscreenchange', () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFs && document.body.classList.contains('fullscreen-mode')) {
            // User escaped native fullscreen — stay in CSS play mode unless they tap exit
            // (Most apps drop fullscreen entirely; we do too for clarity.)
            document.body.classList.remove('fullscreen-mode');
            syncTouchOverlay();
        }
    });

    // ESC also exits play mode (handy on desktop)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) {
            exitPlayMode();
        }
    });

    // -----------------------------------------------------------
    // Fullscreen hint banner
    // -----------------------------------------------------------
    function showHint() {
        if (!fullscreenHint) return;
        if (localStorage.getItem('hintDismissed')) return;
        fullscreenHint.style.display = 'flex';
    }
    function hideHint() {
        if (fullscreenHint) fullscreenHint.style.display = 'none';
    }
    if (dismissHintBtn) {
        dismissHintBtn.addEventListener('click', () => {
            localStorage.setItem('hintDismissed', '1');
            hideHint();
        });
    }

    // Show hint on initial load for touch/mobile users
    if ((isTouchDevice || isMobileViewport()) && !localStorage.getItem('hintDismissed')) {
        showHint();
    }

    // -----------------------------------------------------------
    // Viewport resize → re-sync touch overlay
    // -----------------------------------------------------------
    let resizeRaf = null;
    window.addEventListener('resize', () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(syncTouchOverlay);
    });

    // -----------------------------------------------------------
    // Canvas focus helper
    // -----------------------------------------------------------
    canvas.setAttribute('tabindex', '0');
    canvas.addEventListener('keydown', (e) => e.preventDefault());

    // -----------------------------------------------------------
    // file:// protocol warning
    // -----------------------------------------------------------
    if (window.location.protocol === 'file:') {
        const warning = document.getElementById('fileProtocolWarning');
        if (warning) warning.style.display = 'block';
        status.textContent = '⚠ Please use a web server (see warning above)';
        emulator.log('⚠ Running from file:// - CORS restrictions will prevent loading external resources');
    } else {
        status.textContent = 'Ready! Select a system and load a ROM file.';
        emulator.log('Emulator ready');
    }

    // Initial overlay sync
    syncTouchOverlay();
});

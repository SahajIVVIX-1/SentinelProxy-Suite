/* Custom Modal System for Chakhdi Dashboard */
(function () {
    // Create modal container
    const modalHTML = `
    <div id="customModal" class="custom-modal-overlay">
        <div class="custom-modal">
            <div class="custom-modal-icon" id="modalIcon"></div>
            <h3 class="custom-modal-title" id="modalTitle">Confirm</h3>
            <p class="custom-modal-message" id="modalMessage"></p>
            <div class="custom-modal-actions">
                <button class="custom-modal-btn cancel" id="modalCancel">Cancel</button>
                <button class="custom-modal-btn confirm" id="modalConfirm">Confirm</button>
            </div>
        </div>
    </div>`;

    const modalStyles = `
    <style id="customModalStyles">
        .custom-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.8);
            display: none; justify-content: center; align-items: center;
            z-index: 10000; backdrop-filter: blur(5px);
            animation: modalFadeIn 0.2s ease;
        }
        .custom-modal-overlay.active { display: flex; }
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .custom-modal {
            background: linear-gradient(145deg, #12121f, #0a0a14);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px; padding: 30px 35px;
            max-width: 400px; width: 90%; text-align: center;
            box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 100px rgba(0,0,0,0.3);
            animation: modalSlideIn 0.25s ease;
        }
        .custom-modal-icon { font-size: 3rem; margin-bottom: 15px; }
        .custom-modal-title {
            color: #fff; font-size: 1.3rem; font-weight: 700;
            margin: 0 0 10px 0; font-family: 'JetBrains Mono', monospace;
        }
        .custom-modal-message {
            color: #aaa; font-size: 0.9rem; margin: 0 0 25px 0;
            line-height: 1.5; font-family: 'JetBrains Mono', monospace;
        }
        .custom-modal-actions { display: flex; gap: 12px; justify-content: center; }
        .custom-modal-btn {
            padding: 10px 25px; border-radius: 8px; font-weight: 600;
            font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
            font-family: 'JetBrains Mono', monospace; border: 1px solid;
        }
        .custom-modal-btn.cancel {
            background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2);
            color: #888;
        }
        .custom-modal-btn.cancel:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .custom-modal-btn.confirm {
            background: rgba(0,243,255,0.1); border-color: rgba(0,243,255,0.4);
            color: #00f3ff;
        }
        .custom-modal-btn.confirm:hover {
            background: #00f3ff; color: #000;
            box-shadow: 0 0 20px rgba(0,243,255,0.4);
        }
        .custom-modal-btn.confirm.danger {
            background: rgba(255,0,68,0.1); border-color: rgba(255,0,68,0.4);
            color: #ff0044;
        }
        .custom-modal-btn.confirm.danger:hover {
            background: #ff0044; color: #fff;
            box-shadow: 0 0 20px rgba(255,0,68,0.4);
        }
        .custom-modal-btn.confirm.success {
            background: rgba(0,255,136,0.1); border-color: rgba(0,255,136,0.4);
            color: #00ff88;
        }
        .custom-modal-btn.confirm.success:hover {
            background: #00ff88; color: #000;
            box-shadow: 0 0 20px rgba(0,255,136,0.4);
        }
    </style>`;

    // Inject styles and HTML once DOM is ready
    function init() {
        if (!document.getElementById('customModalStyles')) {
            document.head.insertAdjacentHTML('beforeend', modalStyles);
        }
        if (!document.getElementById('customModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Global modal functions
    window.showModal = function (options) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('customModal');
            const iconEl = document.getElementById('modalIcon');
            const titleEl = document.getElementById('modalTitle');
            const messageEl = document.getElementById('modalMessage');
            const cancelBtn = document.getElementById('modalCancel');
            const confirmBtn = document.getElementById('modalConfirm');

            const type = options.type || 'confirm'; // confirm, alert, danger
            const icons = { confirm: '❓', alert: 'ℹ️', danger: '⚠️', success: '✅', delete: '🗑️' };

            iconEl.textContent = options.icon || icons[type] || icons.confirm;
            titleEl.textContent = options.title || 'Confirm';
            messageEl.textContent = options.message || 'Are you sure?';
            confirmBtn.textContent = options.confirmText || 'Confirm';
            cancelBtn.textContent = options.cancelText || 'Cancel';

            // Reset classes
            confirmBtn.className = 'custom-modal-btn confirm';
            if (type === 'danger' || type === 'delete') confirmBtn.classList.add('danger');
            if (type === 'success') confirmBtn.classList.add('success');

            // Alert mode: hide cancel
            if (type === 'alert') {
                cancelBtn.style.display = 'none';
            } else {
                cancelBtn.style.display = 'inline-block';
            }

            overlay.classList.add('active');

            const cleanup = (result) => {
                overlay.classList.remove('active');
                cancelBtn.onclick = null;
                confirmBtn.onclick = null;
                resolve(result);
            };

            cancelBtn.onclick = () => cleanup(false);
            confirmBtn.onclick = () => cleanup(true);
            overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
        });
    };

    window.customConfirm = function (message, title = 'Confirm') {
        return showModal({ type: 'confirm', title, message });
    };

    window.customAlert = function (message, title = 'Notice') {
        return showModal({ type: 'alert', title, message, confirmText: 'OK' });
    };

    window.customDelete = function (message, title = 'Delete') {
        return showModal({ type: 'delete', title, message, confirmText: 'Delete', icon: '🗑️' });
    };

    /* Progress Modal Extensions */
    window.importCancelled = false;

    window.showProgressModal = function (title, message = '', showCancel = false) {
        window.importCancelled = false;
        const overlay = document.getElementById('customModal');
        const iconEl = document.getElementById('modalIcon');
        const titleEl = document.getElementById('modalTitle');
        const messageEl = document.getElementById('modalMessage');
        const actionsEl = document.querySelector('.custom-modal-actions');
        const cancelBtn = document.getElementById('modalCancel');
        const confirmBtn = document.getElementById('modalConfirm');

        iconEl.innerHTML = '<span class="icon spin">sync</span>';
        titleEl.textContent = title;
        messageEl.textContent = message;

        if (showCancel) {
            actionsEl.style.display = 'flex';
            cancelBtn.style.display = 'inline-block';
            cancelBtn.textContent = 'Cancel';
            confirmBtn.style.display = 'none';
            cancelBtn.onclick = () => {
                window.importCancelled = true;
                closeProgressModal();
            };
        } else {
            actionsEl.style.display = 'none';
        }

        overlay.classList.add('active');
        overlay.onclick = null;
    };

    window.updateProgressModal = function (message) {
        const messageEl = document.getElementById('modalMessage');
        if (messageEl) messageEl.textContent = message;
    };

    window.closeProgressModal = function () {
        const overlay = document.getElementById('customModal');
        const actionsEl = document.querySelector('.custom-modal-actions');
        const confirmBtn = document.getElementById('modalConfirm');
        overlay.classList.remove('active');
        actionsEl.style.display = 'flex';
        confirmBtn.style.display = 'inline-block';
    };
})();

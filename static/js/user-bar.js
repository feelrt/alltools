/**
 * user-bar.js - 通用用户信息栏组件
 * 依赖: Bootstrap 5 JS & CSS
 * 功能: 自动检测登录状态，显示头像/积分/下拉菜单，处理退出登录
 */
(function() {
    // === 配置项 ===
    const CONFIG = {
        apiBase: '/api/v1/auth',
        loginUrl: '/account/login.html',
        profileUrl: '/account/profile.html',
        // 挂载点选择器：脚本会尝试把用户信息追加到这个元素的末尾 (使用 ms-auto 居右)
        targetSelector: '.navbar .container-fluid'
    };

    // === 简易 API 封装 ===
    async function request(endpoint, method = 'GET') {
        try {
            const res = await fetch(CONFIG.apiBase + endpoint, { method });
            if (!res.ok) throw new Error(res.status);
            return await res.json();
        } catch (e) {
            throw e;
        }
    }

    // === 核心逻辑 ===
    async function initUserBar() {
        const container = document.querySelector(CONFIG.targetSelector);
        if (!container) {
            console.warn('UserBar: 未找到导航栏容器 (.navbar .container-fluid)，无法挂载。');
            return;
        }

        // 创建包裹容器，使用 ms-auto 将其推到最右侧
        const wrapper = document.createElement('div');
        wrapper.className = 'ms-auto d-flex align-items-center';

        // 占位，防止加载时跳动
        wrapper.innerHTML = '<div class="spinner-border spinner-border-sm text-secondary" role="status"></div>';
        container.appendChild(wrapper);

        try {
            // 1. 并行获取用户信息和积分 (如果 /me 失败会直接进 catch)
            // 注意：如果未登录 /me 会报 401
            const user = await request('/me');

            // 尝试获取积分，如果失败（比如接口报错）默认显示 0，不阻塞页面
            let points = 0;
            try {
                const pData = await request('/points');
                points = pData.balance || 0;
            } catch (ignore) {}

            // 2. 生成头像 URL (使用用户名首字母)
            const avatarUrl = `https://ui-avatars.com/api/?name=${user.username}&background=0d6efd&color=fff&size=64`;

            // 3. 渲染登录状态 UI (Bootstrap Dropdown)
            wrapper.innerHTML = `
                <div class="dropdown">
                    <a href="#" class="d-flex align-items-center text-decoration-none dropdown-toggle text-light" 
                       id="userDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                        <img src="${avatarUrl}" alt="Avatar" width="32" height="32" class="rounded-circle me-2 border border-secondary">
                        <span class="d-none d-md-inline small fw-bold">${user.username}</span>
                    </a>
                    <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark shadow-lg border-secondary" aria-labelledby="userDropdown" style="min-width: 200px;">
                        <li>
                            <div class="px-3 py-2 border-bottom border-secondary border-opacity-25">
                                <div class="small text-secondary">当前积分</div>
                                <div class="fs-5 fw-bold text-warning font-monospace">${points}</div>
                            </div>
                        </li>
                        <li><a class="dropdown-item py-2 mt-2" href="${CONFIG.profileUrl}"><i class="bi bi-person-gear me-2"></i>个人中心</a></li>
                        <li><hr class="dropdown-divider border-secondary border-opacity-25"></li>
                        <li><a class="dropdown-item py-2 text-danger" href="#" id="global-logout-btn"><i class="bi bi-box-arrow-right me-2"></i>退出登录</a></li>
                    </ul>
                </div>
            `;

            // 4. 绑定退出事件
            document.getElementById('global-logout-btn').addEventListener('click', async (e) => {
                e.preventDefault();
                try { await request('/logout', 'POST'); } catch(e){}
                location.href = CONFIG.loginUrl;
            });

        } catch (err) {
            // 401 或其他错误 -> 渲染未登录状态
            console.log('UserBar: Not logged in or error', err);
            wrapper.innerHTML = `
                <a href="${CONFIG.loginUrl}" class="btn btn-sm btn-outline-light fw-bold px-3">
                    <i class="bi bi-person-fill me-1"></i>登录
                </a>
            `;
        }
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUserBar);
    } else {
        initUserBar();
    }
})();
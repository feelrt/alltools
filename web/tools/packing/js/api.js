export async function postPacking(payload) {
    const res = await fetch('/api/v1/tools/packing/calculate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    // 会员体系：
    // 401 未登录 -> 跳转登录页
    // 402 积分不足 -> 跳转购买页
    if (res.status === 401) {
        window.location.href = '/account/login.html';
        return { status: 'error', detail: 'not_logged_in' };
    }
    if (res.status === 402) {
        window.location.href = '/account/buy.html';
        return { status: 'error', detail: 'insufficient_points' };
    }
    return await res.json();
}
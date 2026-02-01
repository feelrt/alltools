export async function postPacking(payload) {
    const res = await fetch('/api/v1/tools/packing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return await res.json();
}
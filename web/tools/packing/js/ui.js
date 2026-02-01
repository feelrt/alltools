export function addItemRow() {
    const container = document.getElementById('item-list');
    const div = document.createElement('div');
    div.className = "bg-gray-700/30 p-2 rounded border border-gray-600 space-y-2";
    div.innerHTML = `
        <input type="text" placeholder="名称" class="w-full bg-gray-800 text-xs p-1 rounded i-name">
        <div class="flex gap-1">
            <input type="number" placeholder="W" class="w-1/4 bg-gray-800 text-xs p-1 rounded i-w">
            <input type="number" placeholder="H" class="w-1/4 bg-gray-800 text-xs p-1 rounded i-h">
            <input type="number" placeholder="D" class="w-1/4 bg-gray-800 text-xs p-1 rounded i-d">
            <input type="number" placeholder="Qty" class="w-1/4 bg-gray-800 text-xs p-1 rounded i-qty">
        </div>
        <div class="flex justify-between items-center">
            <input type="color" class="h-5 w-10 bg-transparent i-color" value="#3b82f6">
            <button onclick="this.parentElement.parentElement.remove()" class="text-red-400 text-xs">删除</button>
        </div>
    `;
    container.appendChild(div);
}

export function getFormData() {
    const items = [];
    document.querySelectorAll('#item-list > div').forEach(row => {
        items.push({
            name: row.querySelector('.i-name').value || 'Box',
            w: parseFloat(row.querySelector('.i-w').value) || 0,
            h: parseFloat(row.querySelector('.i-h').value) || 0,
            d: parseFloat(row.querySelector('.i-d').value) || 0,
            count: parseInt(row.querySelector('.i-qty').value) || 1,
            color: row.querySelector('.i-color').value
        });
    });
    return {
        bin_size: [
            parseFloat(document.getElementById('bin-w').value) || 0,
            parseFloat(document.getElementById('bin-h').value) || 0,
            parseFloat(document.getElementById('bin-d').value) || 0
        ],
        unit: document.getElementById('bin-unit').value,
        items: items
    };
}

export function setLoader(show) {
    document.getElementById('loader').style.display = show ? 'flex' : 'none';
}
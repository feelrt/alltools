import time
import numpy as np
from numba import njit


# --- 核心优化：将搜索逻辑全部移入 Numba ---
# 修复点：函数定义中增加了 it_h 参数
@njit
def find_best_pos_numba(height_map, bin_w, bin_h, bin_d, it_w, it_h, it_d):
    """
    全机器码执行的搜索函数
    返回: (best_x, best_z, best_y, found)
    """
    best_z = 2147483647  # Int32 Max
    best_x = -1
    best_y = -1
    found = False

    limit_x = bin_w - it_w
    limit_y = bin_d - it_d

    # 1. 机器码级的外层循环 (极速)
    for y in range(0, limit_y + 1):
        for x in range(0, limit_x + 1):

            # --- 内联的 find_best_z 逻辑 ---
            current_z = 0
            is_valid = True

            # 扫描放置区域的最大高度
            for ix in range(x, x + it_w):
                for iy in range(y, y + it_d):
                    val = height_map[ix, iy]
                    if val > current_z:
                        current_z = val
                    # [极速剪枝]：如果当前区域高度已经比已知的最佳高度还高，直接放弃
                    if current_z >= best_z:
                        is_valid = False
                        break
                if not is_valid: break

            # 判定是否可行
            if is_valid:
                # 修复点：这里现在可以正确访问 it_h 了
                if current_z + it_h <= bin_h:
                    if current_z < best_z:
                        best_z = current_z
                        best_x = x
                        best_y = y
                        found = True
                        # [贪婪策略]：如果贴地了，直接返回
                        if best_z == 0:
                            return best_x, best_z, best_y, True

    return best_x, best_z, best_y, found


class SmartPacker:
    def __init__(self, bin_w, bin_h, bin_d):
        self.bin_w = int(bin_w)
        self.bin_h = int(bin_h)
        self.bin_d = int(bin_d)
        self.items = []
        # int32 内存优化
        self.height_map = np.zeros((self.bin_w + 1, self.bin_d + 1), dtype=np.int32)

    def get_rotations(self, w, h, d):
        """几何去重"""
        dims = (int(w), int(h), int(d))
        unique_dims = sorted(list(set(dims)))
        if len(unique_dims) == 1: return [dims]
        if len(unique_dims) == 2:
            w, h, d = dims
            return list(set([(w, h, d), (h, d, w), (d, w, h)]))
        w, h, d = dims
        return list(set([(w, h, d), (w, d, h), (h, w, d), (h, d, w), (d, w, h), (d, h, w)]))

    def add_item_group(self, name, w, h, d, count):
        iw, ih, id_ = int(w), int(h), int(d)
        rotations = self.get_rotations(iw, ih, id_)

        for _ in range(count):
            placed = False
            for rw, rh, rd in rotations:
                # 修复点：调用时传入 int(rh)
                bx, bz, by, found = find_best_pos_numba(
                    self.height_map, self.bin_w, self.bin_h, self.bin_d,
                    int(rw), int(rh), int(rd)
                )

                if found:
                    new_z = bz + rh
                    self.height_map[bx: bx + rw, by: by + rd] = new_z

                    self.items.append({
                        "name": name,
                        "pos": [int(bx), int(bz), int(by)],
                        "dim": [int(rw), int(rh), int(rd)]
                    })
                    placed = True
                    break


def calculate_smart_factor(dims):
    """智能去零算法"""
    valid_dims = [d for d in dims if d > 0]
    if not valid_dims: return 1
    factor = 1
    while all(d % 10 == 0 for d in valid_dims):
        factor *= 10
        valid_dims = [d // 10 for d in valid_dims]
    return factor


# 增加一个最大像素限制 (约 400MB 内存占用)
# 100,000,000 像素点 x 4字节 = 381 MB
MAX_AREA_LIMIT = 100_000_000


def run_packing(data):
    """
    全加速引擎 + 统计未装箱货物
    """
    start_perf = time.perf_counter()

    # --- 安全检查逻辑 (保持不变) ---
    raw_area = data.bin_size[0] * data.bin_size[2]
    MAX_AREA_LIMIT = 100_000_000
    if raw_area > MAX_AREA_LIMIT:
        all_dims_temp = [data.bin_size[0], data.bin_size[1], data.bin_size[2]]
        factor_temp = calculate_smart_factor(all_dims_temp)
        if (raw_area / (factor_temp * factor_temp)) > MAX_AREA_LIMIT:
            raise ValueError(f"容器尺寸过大！")

    total_items = sum(item.count for item in data.items)
    LIMIT_COUNT = 5000
    if total_items > LIMIT_COUNT:
        raise ValueError(f"物品总数过多 ({total_items}个)！")

    # --- 计算逻辑 (保持不变) ---
    all_dims = [data.bin_size[0], data.bin_size[1], data.bin_size[2]]
    for item in data.items:
        all_dims.extend([item.w, item.h, item.d])

    factor = calculate_smart_factor(all_dims)

    scaled_bin_w = data.bin_size[0] // factor
    scaled_bin_h = data.bin_size[1] // factor
    scaled_bin_d = data.bin_size[2] // factor

    packer = SmartPacker(scaled_bin_w, scaled_bin_h, scaled_bin_d)

    # 排序
    sorted_items = sorted(data.items, key=lambda x: (x.w * x.h * x.d, x.h), reverse=True)

    # 核心装箱循环
    for item in sorted_items:
        packer.add_item_group(item.name, item.w // factor, item.h // factor, item.d // factor, item.count)

    # --- 【新增】统计未装入的货物 ---
    # 1. 统计实际装了多少 (packer.items 里是平铺的，需要聚合)
    packed_counter = {}
    for it in packer.items:
        name = it["name"]
        packed_counter[name] = packed_counter.get(name, 0) + 1

    # 2. 对比请求数量
    unpacked_list = []
    for item in data.items:
        name = item.name
        requested_count = item.count
        actual_count = packed_counter.get(name, 0)

        left_over = requested_count - actual_count
        if left_over > 0:
            unpacked_list.append({
                "name": name,
                "left": left_over,
                "total": requested_count
            })

    # --- 还原坐标 (保持不变) ---
    final_items = []
    for it in packer.items:
        final_items.append({
            "name": it["name"],
            "pos": [p * factor for p in it["pos"]],
            "dim": [d * factor for d in it["dim"]]
        })

    duration = time.perf_counter() - start_perf
    print(
        f"⚡ [Backend] 耗时: {duration:.4f}s | 装入: {len(final_items)} | 未装: {sum(x['left'] for x in unpacked_list)}")

    # 返回两个列表：装好的 items，和没装进去的统计
    return final_items, unpacked_list
#!/usr/bin/env python3
"""
数据迁移工具：将旧格式的 .anime 文件转换为 State-Centric 格式

用法:
    python tools/migrate_character_data.py path/to/file.anime
    python tools/migrate_character_data.py path/to/directory/
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any
import shutil
from datetime import datetime


def migrate_character(old_char: Dict[str, Any]) -> Dict[str, Any]:
    """将单个 Character 从旧格式迁移到新格式"""
    
    print(f"  迁移人物: {old_char['name']}")
    
    # 提取全局数据
    global_parts = old_char.get('parts', [])
    global_assets = old_char.get('partAssets', {})
    global_zindexes = old_char.get('partZIndexes', {})
    
    #创建新的 Character 对象（移除全局 parts/partAssets/partZIndexes）
    new_char = {
        'id': old_char['id'],
        'name': old_char['name'],
        'gender': old_char['gender'],
        'states': {}
    }
    
    # 复制可选字段
    for field in ['defaultScale', 'applyScale', 'lockEdit', 'defaultStateId', 
                  'defaultVoiceId', 'createdAt', 'updatedAt', 'tags', 'thumbnail',
                  '_runtimeThumbnailUrl', '_thumbnailPath']:
        if field in old_char:
            new_char[field] = old_char[field]
    
    # 迁移每个 State
    old_states = old_char.get('states', {})
    for state_id, old_state in old_states.items():
        new_state = migrate_state(
            old_state,
            global_parts,
            global_assets,
            global_zindexes
        )
        new_char['states'][state_id] = new_state
    
    print(f"    ✓ 迁移了 {len(new_char['states'])} 个姿态")
    return new_char


def migrate_state(
    old_state: Dict[str, Any],
    global_parts: List[Dict[str, Any]],
    global_assets: Dict[str, List[Dict[str, Any]]],
    global_zindexes: Dict[str, int]
) -> Dict[str, Any]:
    """将单个 CharacterState 从旧格式迁移到新格式"""
    
    # 获取 Z-index（优先使用 state 级别，否则使用全局）
    state_zindexes = old_state.get('partZIndexes', {})
    effective_zindexes = {**global_zindexes, **state_zindexes}
    
    # 获取旧的 part instances
    old_part_instances = old_state.get('parts', {})
    
    # 按 Z-index 排序部位 ID
    sorted_part_ids = sorted(
        old_part_instances.keys(),
        key=lambda pid: effective_zindexes.get(pid, 0)
    )
    
    # 创建新的部位列表
    new_parts = []
    for part_id in sorted_part_ids:
        part_instance = old_part_instances[part_id]
        
        # 查找全局部位定义
        global_part = find_part(global_parts, part_id)
        if not global_part:
            print(f"      ⚠️  警告: 找不到部位定义 {part_id}，跳过")
            continue
        
        # 获取该部位的素材池
        part_assets = global_assets.get(part_id, [])
        
        # 获取当前素材ID和变换
        current_asset_id = part_instance['assetId']
        transform = part_instance['transform']
        
        # 创建新部位（State-Centric格式）
        new_part = {
            'id': part_id,
            'name': global_part['name'],
            'type': global_part['type'],
            'visible': transform.get('visible', True),
            'locked': False,
            'assets': part_assets,  # 复制素材池到部位
            'currentAssetId': current_asset_id,
            'assetConfigs': {
                # 只为当前使用的素材创建配置
                current_asset_id: {
                    'assetId': current_asset_id,
                    'transform': {
                        'x': transform.get('x', 0),
                        'y': transform.get('y', 0),
                        'rotation': transform.get('rotation', 0),
                        'scale': transform.get('scale', {'x': 1, 'y': 1}),
                        'alpha': transform.get('alpha', 1.0),
                        'visible': transform.get('visible', True),
                        'flipX': transform.get('flipX', False)
                    }
                }
            }
        }
        
        new_parts.append(new_part)
    
    # 创建新的 State
    new_state = {
        'id': old_state['id'],
        'name': old_state['name'],
        'parts': new_parts  # 现在是数组而不是对象
    }
    
    # 复制可选字段
    for field in ['thumbnail', '_runtimeThumbnailUrl', '_thumbnailPath', 'bounds']:
        if field in old_state:
            new_state[field] = old_state[field]
    
    return new_state


def find_part(parts: List[Dict[str, Any]], part_id: str) -> Dict[str, Any] | None:
    """在全局部位列表中查找部位定义"""
    for part in parts:
        if part['id'] == part_id:
            return part
    return None


def migrate_file(file_path: Path) -> bool:
    """迁移单个 .anime 文件"""
    
    print(f"\n处理文件: {file_path}")
    
    try:
        # 读取文件
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 备份原文件
        backup_path = file_path.with_suffix('.anime.backup')
        shutil.copy2(file_path, backup_path)
        print(f"✓ 已备份到: {backup_path}")
        
        # 迁移 characters（可能在顶层或assets中）
        old_characters = None
        characters_location = None
        
        if 'characters' in data and isinstance(data['characters'], dict):
            old_characters = data['characters']
            characters_location = 'top_level'
            print(f"✓ 找到顶层characters（dict格式），共 {len(old_characters)} 个")
        elif 'assets' in data and 'characters' in data['assets']:
            old_characters = data['assets']['characters']
            characters_location = 'assets'
            print(f"✓ 找到assets.characters，共 {len(old_characters)} 个")
        
        if old_characters:
            new_characters = {}
            
            # 处理dict格式的characters
            if isinstance(old_characters, dict):
                for char_id, old_char in old_characters.items():
                    new_char = migrate_character(old_char)
                    new_characters[char_id] = new_char
            # 处理list格式的characters
            elif isinstance(old_characters, list):
                for old_char in old_characters:
                    new_char = migrate_character(old_char)
                    new_characters[new_char['id']] = new_char
            
            # 写回到原位置
            if characters_location == 'top_level':
                data['characters'] = new_characters
            else:
                data['assets']['characters'] = new_characters
        
        # 写入新文件
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✓ 迁移完成: {file_path}")
        return True
        
    except Exception as e:
        print(f"✗ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    if len(sys.argv) < 2:
        print("用法: python migrate_character_data.py <file.anime|directory>")
        sys.exit(1)
    
    path = Path(sys.argv[1])
    
    if not path.exists():
        print(f"错误: 路径不存在: {path}")
        sys.exit(1)
    
    print("=" * 60)
    print("人物数据迁移工具 - State-Centric Model")
    print("=" * 60)
    
    files_to_process = []
    
    if path.is_file():
        if path.suffix == '.anime':
            files_to_process.append(path)
        else:
            print(f"错误: 文件必须是 .anime 格式")
            sys.exit(1)
    elif path.is_dir():
        files_to_process = list(path.glob('**/*.anime'))
        print(f"找到 {len(files_to_process)} 个 .anime 文件")
    
    if not files_to_process:
        print("没有找到要处理的文件")
        sys.exit(0)
    
    success_count = 0
    for file_path in files_to_process:
        if migrate_file(file_path):
            success_count += 1
    
    print("\n" + "=" * 60)
    print(f"迁移完成: {success_count}/{len(files_to_process)} 成功")
    print("=" * 60)
    
    if success_count < len(files_to_process):
        sys.exit(1)


if __name__ == '__main__':
    main()

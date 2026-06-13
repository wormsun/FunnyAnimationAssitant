#!/usr/bin/env python3
"""检查.anime文件结构"""
import json
import sys
from pathlib import Path

def check_structure(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    chars = data.get('characters', {})
    print(f"Characters type: {type(chars)}")
    print(f"Number of characters: {len(chars)}")
    
    if not chars:
        return
    
    char_id = list(chars.keys())[0]
    char = chars[char_id]
    print(f"\nFirst character ID: {char_id}")
    print(f"First character: {char.get('name')}")
    print(f"Character keys: {list(char.keys())}")
    
    if 'states' in char:
        states = list(char['states'].values())
        print(f"\nNumber of states: {len(states)}")
        
        if states:
            state = states[0]
            print(f"First state keys: {list(state.keys())}")
            
            if 'parts' in state:
                parts = state['parts']
                print(f"Parts type: {type(parts)}")
                print(f"Parts is list: {isinstance(parts, list)}")
                print(f"Parts is dict: {isinstance(parts, dict)}")
                
                if isinstance(parts, list):
                    print(f"Number of parts (list): {len(parts)}")
                    if parts:
                        part = parts[0]
                        print(f"First part keys: {list(part.keys()) if isinstance(part, dict) else type(part)}")
                elif isinstance(parts, dict):
                    print(f"Number of parts (dict): {len(parts)}")
                    part_id = list(parts.keys())[0] if parts else None
                    if part_id:
                        part = parts[part_id]
                        print(f"First part ID: {part_id}")
                        print(f"First part keys: {list(part.keys())}")


if __name__ == '__main__':
    check_structure(sys.argv[1])

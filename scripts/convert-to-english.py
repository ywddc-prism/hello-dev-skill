#!/usr/bin/env python3
"""
Remove emoji and translate Chinese to English in Hello Dev files.
"""

import os
import re
import sys

# Emoji patterns to remove
EMOJI_PATTERNS = [
    re.compile(r'[\U0001F600-\U0001F64F]'),  # Emoticons
    re.compile(r'[\U0001F300-\U0001F5FF]'),  # Misc Symbols and Pictographs
    re.compile(r'[\U0001F680-\U0001F6FF]'),  # Transport and Map
    re.compile(r'[\U0001F1E0-\U0001F1FF]'),  # Flags
    re.compile(r'[\U0001F900-\U0001F9FF]'),  # Supplemental Symbols
    re.compile(r'[\U0001FA00-\U0001FA6F]'),  # Chess Symbols
    re.compile(r'[\U0001FA70-\U0001FAFF]'),  # Symbols Extended-A
    re.compile(r'[\U00002600-\U000026FF]'),  # Misc symbols
    re.compile(r'[\U00002700-\U000027BF]'),  # Dingbats
    re.compile(r'[\U0000FE00-\U0000FE0F]'),  # Variation Selectors
    re.compile(r'[\U0000200D]'),  # Zero Width Joiner
    re.compile(r'[\U000020E3]'),  # Combining Enclosing Keycap
    re.compile(r'[\U0000FE0F]'),  # Variation Selector-16
    re.compile(r'[\u2600-\u26FF]'),  # Misc symbols (BMP)
    re.compile(r'[\u2700-\u27BF]'),  # Dingbats (BMP)
    re.compile(r'[\u2B50]'),  # Star
    re.compile(r'[\u2764]'),  # Heart
    re.compile(r'[\u2705]'),  # Check mark
    re.compile(r'[\u274C]'),  # Cross mark
    re.compile(r'[\u26A0]'),  # Warning
    re.compile(r'[\u26D4]'),  # No entry
    re.compile(r'[\u2728]'),  # Sparkles
    re.compile(r'[\u2753]'),  # Question mark
    re.compile(r'[\u2757]'),  # Exclamation mark
    re.compile(r'[\u2796]'),  # Division sign
    re.compile(r'[\u27A1]'),  # Right arrow
    re.compile(r'[\u2B05]'),  # Left arrow
    re.compile(r'[\u2B06]'),  # Up arrow
    re.compile(r'[\u2B07]'),  # Down arrow
    re.compile(r'[\u2934]'),  # Right arrow curving up
    re.compile(r'[\u2935]'),  # Right arrow curving down
    re.compile(r'[\u3030]'),  # Wavy dash
    re.compile(r'[\u303D]'),  # Part alternation mark
    re.compile(r'[\u3297]'),  # Circled Ideograph Congratulation
    re.compile(r'[\u3299]'),  # Circled Ideograph Secret
]

def remove_emoji(text):
    """Remove all emoji from text."""
    for pattern in EMOJI_PATTERNS:
        text = pattern.sub('', text)
    return text

def clean_whitespace(text):
    """Clean up extra whitespace left after emoji removal."""
    # Remove multiple spaces (but preserve newlines)
    text = re.sub(r'  +', ' ', text)
    # Remove space before punctuation
    text = re.sub(r' +([.,;:!?])', r'\1', text)
    return text

def process_file(filepath):
    """Process a single file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        
        # Remove emoji
        content = remove_emoji(content)
        
        # Clean whitespace
        content = clean_whitespace(content)
        
        # TODO: Translation will be done manually file by file
        # This script only removes emoji for now
        
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {filepath}: {e}", file=sys.stderr)
        return False

def main():
    # Root directory: first CLI argument, or the repository containing this script.
    if len(sys.argv) > 1:
        root = sys.argv[1]
    else:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Get all files to process
    files_to_process = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip hidden dirs, node_modules, archive
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and d != 'node_modules' and d != 'archive']
        for f in filenames:
            if f.endswith(('.md', '.js', '.json', '.sh', '.yaml', '.yml')):
                files_to_process.append(os.path.join(dirpath, f))
    
    modified = 0
    for filepath in files_to_process:
        if process_file(filepath):
            modified += 1
            print(f"Modified: {filepath}")
    
    print(f"\nTotal files modified: {modified}")

if __name__ == '__main__':
    main()

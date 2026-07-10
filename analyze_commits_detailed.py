#!/usr/bin/env python3
"""
Comprehensive logbook enhancement script.
Analyzes git commits for each calendar date and enhances corresponding logbook entries
with detailed code archaeology information (line counts, file changes, component names).
"""

import subprocess
import re
from datetime import datetime, timedelta
from collections import defaultdict

def run_git_command(cmd):
    """Run a git command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=r"c:\Anything Important\BP-DragonFly-Garden")
        return result.stdout.strip()
    except Exception as e:
        print(f"Error running git command: {e}")
        return ""

def get_commits_by_date():
    """Get all commits organized by date with statistics."""
    # Get all commits with date and stats
    cmd = 'git log --all --date=short --format="%h|%ad|%s" --reverse'
    output = run_git_command(cmd)
    
    commits_by_date = defaultdict(list)
    
    for line in output.split('\n'):
        if not line or '|' not in line:
            continue
        parts = line.split('|')
        if len(parts) >= 3:
            commit_hash, date_str, message = parts[0], parts[1], '|'.join(parts[2:])
            try:
                date = datetime.strptime(date_str, '%Y-%m-%d').date()
                commits_by_date[date].append((commit_hash, message))
            except:
                pass
    
    return commits_by_date

def get_commit_stats(commit_hash):
    """Get statistics for a specific commit."""
    cmd = f'git show --stat --pretty="" {commit_hash}'
    output = run_git_command(cmd)
    
    # Extract insertions and deletions
    insertions = 0
    deletions = 0
    files_changed = []
    
    for line in output.split('\n'):
        if '|' in line and ('+' in line or '-' in line):
            parts = line.split('|')
            if len(parts) >= 2:
                files_changed.append(parts[0].strip())
                # Try to extract numbers
                stats = parts[1].strip()
                if '+' in stats:
                    nums = re.findall(r'(\d+)', stats)
                    if nums:
                        insertions += int(nums[0])
                        if len(nums) > 1:
                            deletions += int(nums[1])
    
    return {
        'files': files_changed,
        'insertions': insertions,
        'deletions': deletions,
        'total_files': len(files_changed)
    }

def get_commit_diff(commit_hash):
    """Get the actual diff for a commit to extract component names and details."""
    cmd = f'git show {commit_hash}'
    output = run_git_command(cmd)
    return output

def main():
    commits_by_date = get_commits_by_date()
    
    print("Commits by date (sample):")
    dates = sorted(commits_by_date.keys())[:30]  # First 30 dates
    
    for date in dates:
        print(f"\n{date}:")
        for commit_hash, message in commits_by_date[date]:
            stats = get_commit_stats(commit_hash)
            print(f"  {commit_hash[:7]} - {message[:60]}")
            print(f"    Files: {stats['total_files']}, +{stats['insertions']} -{stats['deletions']}")
            if stats['files']:
                print(f"    Changed: {', '.join(stats['files'][:3])}")

if __name__ == "__main__":
    main()

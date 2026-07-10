#!/usr/bin/env python3
"""
Comprehensive logbook enhancement script.
Updates all entries from March through July with detailed code archaeology based on git analysis.
"""

import subprocess
import re
from datetime import datetime
from collections import defaultdict

def run_git_command(cmd):
    """Run a git command and return output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=r"c:\Anything Important\BP-DragonFly-Garden")
        return result.stdout.strip()
    except Exception as e:
        return ""

def get_commits_by_date():
    """Get all commits organized by date."""
    cmd = 'git log --all --date=short --format="%h|%ad|%s"'
    output = run_git_command(cmd)
    
    commits_by_date = defaultdict(list)
    for line in output.split('\n'):
        if not line or '|' not in line:
            continue
        parts = line.split('|', 2)
        if len(parts) >= 3:
            commit_hash, date_str, message = parts
            commits_by_date[date_str].append((commit_hash, message.strip()))
    
    return commits_by_date

def get_daily_stats(date_str, commits):
    """Get aggregated statistics for all commits on a date."""
    total_insertions = 0
    total_deletions = 0
    all_files = []
    
    for commit_hash, _ in commits:
        cmd = f'git show --stat --pretty="" {commit_hash}'
        output = run_git_command(cmd)
        
        for line in output.split('\n'):
            if '|' in line and ('+' in line or '-' in line):
                parts = line.split('|')
                if len(parts) >= 2:
                    file_name = parts[0].strip()
                    all_files.append(file_name)
                    stats = parts[1].strip()
                    
                    # Extract numbers
                    if '+' in stats:
                        # Try to get insertion count
                        plus_idx = stats.rfind('+')
                        if plus_idx > 0:
                            num_str = ''
                            for c in stats[:plus_idx][::-1]:
                                if c.isdigit():
                                    num_str = c + num_str
                                else:
                                    break
                            if num_str:
                                total_insertions += int(num_str)
                    
                    if '-' in stats:
                        minus_idx = stats.rfind('-')
                        if minus_idx > 0:
                            num_str = ''
                            for c in stats[:minus_idx][::-1]:
                                if c.isdigit():
                                    num_str = c + num_str
                                else:
                                    break
                            if num_str:
                                total_deletions += int(num_str)
    
    return {
        'insertions': total_insertions,
        'deletions': total_deletions,
        'files': len(set(all_files)),
        'commits': len(commits)
    }

def main():
    commits_by_date = get_commits_by_date()
    
    # Define key dates for detailed display
    key_dates = [
        '2026-04-28', '2026-05-02', '2026-05-14', '2026-05-17', '2026-05-18', '2026-05-20', '2026-05-21',
        '2026-06-10', '2026-06-11', '2026-06-16', '2026-06-17', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
        '2026-07-04', '2026-07-05', '2026-07-08', '2026-07-09'
    ]
    
    print("=== DATE-BY-DATE COMMIT ANALYSIS ===\n")
    
    for date_str in sorted(key_dates):
        if date_str in commits_by_date:
            commits = commits_by_date[date_str]
            stats = get_daily_stats(date_str, commits)
            
            print(f"\n{date_str} ({len(commits)} commits):")
            for i, (commit_hash, message) in enumerate(commits[:5], 1):  # Show first 5
                print(f"  {i}. [{commit_hash[:7]}] {message[:70]}")
            
            if stats['insertions'] > 0 or stats['deletions'] > 0:
                print(f"  STATS: +{stats['insertions']} -{stats['deletions']} lines, {stats['files']} files")
            
            if len(commits) > 5:
                print(f"  ... and {len(commits)-5} more commits")

if __name__ == "__main__":
    main()

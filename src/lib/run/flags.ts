const baseFlags = ['-std=c++17', '-O1', '-fno-exceptions', '-Iinclude'];
const headerPath = 'include/bits/stdc++.h';
const pchName = 'std.pch';
const pchUrl = '/compiler/std.pch';
const pchMagic = 'CPCH';

export { baseFlags, headerPath, pchMagic, pchName, pchUrl };

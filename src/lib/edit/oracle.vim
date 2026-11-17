set nocompatible noswapfile shiftwidth=4 expandtab autoindent cindent cinkeys=o,O
set backspace=indent,eol,start startofline nojoinspaces
if !empty($ORACLE_SET)
  execute 'set' $ORACLE_SET
endif

function! s:Offset() abort
  let l:before = getline(1, line('.') - 1)
  let l:total = 0
  for l:line in l:before
    let l:total += strlen(l:line) + 1
  endfor
  return l:total + col('.') - 1
endfunction

function! s:Run(case) abort
  enew!
  call setline(1, split(a:case.text, "\n", 1))
  call cursor(a:case.line, a:case.column)
  for l:command in a:case.commands
    call feedkeys(l:command, 'ntx')
  endfor
  return {'text': join(getline(1, '$'), "\n"), 'cursor': s:Offset()}
endfunction

let s:cases = json_decode(join(readfile($ORACLE_IN), "\n"))
let s:results = map(copy(s:cases), {_, case -> s:Run(case)})
call writefile([json_encode(s:results)], $ORACLE_OUT)
qall!

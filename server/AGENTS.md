# backend docstrings

when another file calls a function, document each input by name and what the function returns. this includes api handlers and callbacks registered with a framework. for generators, document what they yield. mention when a function takes no arguments or returns no value

use lowercase prose and preserve the spelling of identifiers. keep short docstrings on one line with a space inside each set of triple quotes. wrap longer ones and use periods between sentences. include details that help callers debug, such as an ambiguous timeout or a missing record. keep file-local helpers brief

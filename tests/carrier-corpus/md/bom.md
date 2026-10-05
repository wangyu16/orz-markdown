{{nyml
kind: document
format: 1
title: Notes Saved with a Byte-Order Mark
author: Yu Wang
license: CC-BY-4.0
}}

# Notes Saved with a Byte-Order Mark

Some Windows editors write a UTF-8 byte-order mark (EF BB BF) before the first
character. The header still counts as leading: only the BOM and whitespace may
precede `{{nyml`. Extraction must give the BOM back, byte for byte.

Equilibrium constant: $K = \dfrac{[\mathrm{C}]^c[\mathrm{D}]^d}{[\mathrm{A}]^a[\mathrm{B}]^b}$.

#!/usr/bin/env python3
"""Gera os ícones PNG (RGBA) da extensão, sem dependências externas."""
import os
import struct
import zlib

TAMANHOS = [16, 32, 48, 128]
CORES = {"cinza": (0x9A, 0xA0, 0xA6), "verde": (0x1E, 0x8E, 0x3E)}
SS = 4  # supersampling 4x4


def dentro(x, y, n):
    """Retorna (no_circulo, na_barra) para um ponto em coordenadas de pixel."""
    c = n / 2.0
    r = n * 0.45  # círculo ocupa ~90% do quadrado
    no_circulo = (x - c) ** 2 + (y - c) ** 2 <= r * r
    meia_larg = n * 0.55 / 2.0
    meia_alt = n * 0.18 / 2.0
    na_barra = abs(x - c) <= meia_larg and abs(y - c) <= meia_alt
    return no_circulo, na_barra


def renderizar(n, cor):
    linhas = []
    for py in range(n):
        linha = bytearray([0])  # filtro None
        for px in range(n):
            cob_c = cob_b = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    c, b = dentro(x, y, n)
                    if c:
                        cob_c += 1
                        if b:
                            cob_b += 1
            total = SS * SS
            if cob_c == 0:
                linha += bytes([0, 0, 0, 0])
                continue
            # mistura premultiplicada: barra branca sobre círculo colorido
            f_branco = cob_b / cob_c
            r = round(cor[0] * (1 - f_branco) + 255 * f_branco)
            g = round(cor[1] * (1 - f_branco) + 255 * f_branco)
            b = round(cor[2] * (1 - f_branco) + 255 * f_branco)
            a = round(255 * cob_c / total)
            linha += bytes([r, g, b, a])
        linhas.append(bytes(linha))
    return b"".join(linhas)


def chunk(tipo, dados):
    crc = zlib.crc32(tipo + dados) & 0xFFFFFFFF
    return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", crc)


def png(n, cor):
    cabecalho = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    idat = zlib.compress(renderizar(n, cor), 9)
    return cabecalho + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main():
    pasta = os.path.dirname(os.path.abspath(__file__))
    for nome, cor in CORES.items():
        for n in TAMANHOS:
            caminho = os.path.join(pasta, "%s-%d.png" % (nome, n))
            with open(caminho, "wb") as f:
                f.write(png(n, cor))
            print("gerado", caminho)


if __name__ == "__main__":
    main()

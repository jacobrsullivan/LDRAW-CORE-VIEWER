
# MPD Files

## Purpose

MPD files or "Multi-Part Documents" are a way to combine several LDraw and encoded binary files into one consolidated source. This allows for ease in posting or emailing a model made up of many subparts.

---

## Structure

An MPD file consists of blocks of LDraw code separated by `0 FILE` or `0 !DATA` statements. Each block is considered a separate file and can be referenced by the other ones as needed.

- **Blocks starting with `0 FILE`** contain normal type `0..5` line LDraw code.
- **Blocks starting with `0 !DATA`** contain binary data encoded using a multitude of `0 !:` lines.

Each of those lines contain a chunk of base64 encoded data which a parser must combine before decoding. No other LDraw statements may be used inside a `!DATA` block.

The end of each block, or just the last block in the MPD, may be marked with a `0 NOFILE` line. The `0 NOFILE` command is only required if the file's contents are followed by non-LDraw content (e.g., the poster's signature lines). LDraw parsers must then ignore all content until a new `0 FILE` or `0 !DATA` is found.

### Main Model  
The first block in the MPD is treated as the 'main model'. All other files in the MPD will only be rendered if they are referenced by the main model, directly or indirectly.  

---

## MPD META Statements

### FILE  
**Format:**  
```
0 FILE <filename>
```  
- `<filename>` is the name of the following LDraw file.

---

### !DATA  
**Format:**  
```
0 !DATA <filename>
```  
- `<filename>` is the filename of the following encoded data.

---

### !:  
**Format:**  
```
0 !: <base64 string>
```  
- `<base64 string>`: A chunk of base64 encoded data (A-Za-z0-9+/) with a maximum length of 80 characters (60 bytes of data).  
- Each line except the last should use the same length and be a multiple of 4 characters. Padding the last line with `=` characters to complete its last group of 4 is optional.

---

### NOFILE  
**Format:**  
```
0 NOFILE
```
There are no options or parameters.

---

## Example

```
0 FILE main.ldr
1 7 0 0 0 1 0 0 0 1 0 0 0 1 819.dat
1 4 80 -8 70 1 0 0 0 1 0 0 0 1 house.ldr
1 4 -70 -8 20 0 0 -1 0 1 0 1 0 0 house.ldr
1 4 50 -8 -20 0 0 -1 0 1 0 1 0 0 house.ldr
1 4 0 -8 -30 1 0 0 0 1 0 0 0 1 house.ldr
1 4 -20 -8 70 1 0 0 0 1 0 0 0 1 house.ldr

0 FILE house.ldr
1 16 0 0 0 1 0 0 0 1 0 0 0 1 3023.dat
1 16 0 -24 0 1 0 0 0 1 0 0 0 1 3065.dat
1 16 0 -48 0 1 0 0 0 1 0 0 0 1 3065.dat
1 16 0 -72 0 0 0 -1 0 1 0 1 0 0 3044b.dat
1 4 0 -22 -10 1 0 0 0 0 -1 0 1 0 sticker.ldr

0 FILE sticker.ldr
0 UNOFFICIAL PART
0 BFC CERTIFY CCW
1 16   0 -0.25 0   20 0 0   0 0.25 0   0 0 30   box5.dat
0 !TEXMAP START PLANAR   -20 -0.25 30   20 -0.25 30   -20 -0.25 -30   sticker.png
4 16   -20 -0.25 30   -20 -0.25 -30   20 -0.25 -30   20 -0.25 30
0 !TEXMAP END

0 !DATA sticker.png
0 !: iVBORw0KGgoAAAANSUhEUgAAAFAAAAB4CAIAAADqjOKhAAAAAXNSR0IArs4c6QAAAARnQU1BAACx
0 !: jwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEUSURBVHhe7du9DcIwFABhk5WgQLSsQM0UjMEU
0 !: 1BQsQIsoYAt6NkAYxQV/JQ7WvfuKkFTR6UmOFJzR9bJLkXTlNwyD6QymM5ju5Tl8m67KGUt3XJcz
0 !: J/yY8HZ/6C8BFvNZPoaesMF0BtMZTGcwncF0BtMZTGcwncF0BtMZTGcwnf8t0bmLh85gOoPpDKYz
0 !: mM5gOoPpDKYzmM5gunDBf3tN+/zqNKt367cbOeGUTstxf1nJZHPOx68T/u3XB5/7/zMXLTqD6Qym
0 !: M5jOYDqD6QymM5jOYDqD6QymM5jOYDqD6QymM5jOYLpwwW3t8ajBXTxtTHgwLlp0BtMZTGcwncF0
0 !: BtMZTNfKZzyDiT3hCFy06IIFp3QH/CBMh66aBy4AAAAASUVORK5CYII=
```

---

**End of Document**

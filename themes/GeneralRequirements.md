General requirements for all theme css

- each theme should follow the same section order
- Set the base font size close to the top of the css file. All font sizes are relative to this base font size. When the base changed, all font sizes chage accordingly. Set line spacing close to the base font size. Both in root?
- Make it easy to apply or to remove markdown-body container size and border settings.
- Images respect the size setting defined in the markdown source. limit the max width and height to the container size. keep respect ratio. 
- Ordered list: use '1, 2, 3, ...' instead of '01, 02, 03, ....' 
- Table container fit the size of the table, not like Neat II leaving empty white space to the right when the table is narrower than the page size. 
- QR code images: allow to increase the size of the QR code images by click on an icon to make it fit the screen size
- SMILES structures: no background or container styles, show the chemical structure directly on the page background, the sizes of chemical structures shoule not be too large (make the bond length about 4em). White bond and atom default color on dark themes, black bond and atom default color on light themes. 
- Make badges fit one line height, avoid adding a lable like 'OUTCOME', 'CAUTION', etc. 
- All support Chinese font, Noto Serif TC and Nato Serif SC when the main font is serif; Noto Sans TC and Noto Sans SC when the main font is sans; use Hanzi Pen TC and SC for handwritten.  
- Printing behavior: print content in markdown-body, no body frame, fit paper width, no splitting image or video on two pages, allow natural page break after table rows with table header repeated on the new page. 

## Remaining problems

- Neat II has not be revised
- QR image enlarge provides a big container, but the qr image is still very small in it. 
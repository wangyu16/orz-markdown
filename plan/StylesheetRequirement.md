# Stylesheet used together with the customized markdown parser

## Special elements need to be included

All common markdown elements should be included. In addition: 

- TOC, where to show it, toggle mechanism, layout and apperance. 
- div with class names: success, info, warning, danger, left, right, center, spoil. The first 4 add colored boxes to the content, the latter 3 define the align behavior. The next one add spoil elment to hide and show content. 
- div with class name tabs and cols for creating elements to be shown in different tabs or in multi columns. Help me to define a way to name the components. 
- span with class names: red, yellow, green, blue, success, info, warning, danger. The first 4 result in colored text, the later 4 create badges. 
- katex.css
- tasklist

## Requirements

- Use google fonts to make sure the contents look the same across platforms
    - header fonts are defined by themes as part of the design
    - allow user to choose main text fonts: serif, sans, handwritten, typewrite
    - Allow user to adjust the fontsize: all fontsize scale propertionaly. 
- All themes need to be clean/neat/modern
- Themes types:
    - dark elegant: ideal for showing any type of content in science/tech with figures, plots, math, etc. in a clear way, the color and styling give readers a comfortable and easy feeling. 
    - beige decent: comfortable for reading, like printed pages with beatiful layout and font design
    - light neat: ideal for showing any type of content, same requirement as the dark elegant theme.
    - light academic: look like professional scientific report in journal publications. One example: LaTeX Tufte-style book template. 
    - light playful: good for casual envent planning, keep shared notes, vivid, happy mood
- For each theme type create a few different choices. 
- For each theme, be creative, to use different decoration methods.


## Plans

- First check if I missed anything
- Create one example markdown file with all possible elements and one stylesheet to see if everything is showing properly.
- create more stylesheets
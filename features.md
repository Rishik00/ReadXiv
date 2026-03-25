## Things that we can add to this to make it nicer:

# Projects/Literature survey (both manual and auto) (Medium, Not Immediate)
A project would be structured as a folder and as a web of papers in  excalidraw. For these web of papers we can have one note that would unify everything relevant for them. 

There can be 2 modes:
1. Manual - I add a list of arxiv links, give the project a title and it can add a note and bring them together as aa graph. 
2. Auto - I give a prompt to an agent and it can go search for upto N (cannot be larger than 10) papers and organize them for me. I have to think about what the harness and what type of agent will this be. 

Why? - Because i can often find myself in survey mode, where I go for a paper and do like a whole deepdie into teat particular area. 

Ways to start a project: 
1. With multiple arxiv links
2. From a base paper itself - for ex I can go pick a paper from the papershelf and that can bee a project where i look through the references and it makes relevant paper notes for all of them and store them in a folder. 


# Fast and accessible search (Small, Immediate) - Implemented
Just like obsidian, I want to have a fast search interface to search for keywords, titles, authors. This should be similar to neovim's interface and should be immediately available for me at any place. You can take inspiration from neovim's file browser for this feature. 

# Recents (Small, Immediate) - Implemented
Right now the recent's is filled with placeholders. I want to have it filled with the 3 most recent papernote objects I have used/created. Should be easy. 

# A proper neovim like interface (Medium, Immediate)
I really love vim bindings, and I want to have them whereever possible! The following feature will involve 2 things: 

1. Expand the current set of keybindings to make the whole experience more navigable using the keyboard. This involves going to different sections of the app and performing different actions. I will note the keybindings that would be ideal, though I think it should be normal keybindings you use in neovim for navigating and editing the file. 

Do note that I don't want to over complicate this, just want to have a similar experience with the whole navigation. 

2. Enable keybindings in the markdown editor that would make it neovim-like. This involves different editor modes, copy pasting content and vim keybindings for different actions. (Done)

Note: this feature should be enabled via a `enable-vim-navigation` for the first one and `enable-vim-keybindings` for the second one. Both of them will be settings when enabled will aid in the above behaviours. 

# Better structuring for the PDF reader and notes editor (Small, Immediate)
For the PDF reader: 
1. Allow annotation/marking highlighted text for me to quote inside the markdown editor. 

For the notes editor: 
1. Allow latex compilation for equations and mathematical notation. 
2. The notes should have the following hierarchy to start, treat this as a template to ue everytime: 
    1. First - Quotes from the paper that I have highlighted in the PDF. 
    2. Second - My own opinions and questions. Also questions can be framed as a quote in markdown with the white bar behind them and everything.  

# Bugs/Things that need fixing (small/medium, immediate)

1. The PDF reader is wayy too small and low dimensional in terms of resolution. 
2. The markdown preview thing doesn't work. And I don't know whether auto save is enabled or do I have to save it manually? 
3. I cannot do anything to the PDF, no pinch zoom, no highlighting

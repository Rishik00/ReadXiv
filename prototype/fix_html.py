import re

def fix_bw():
    with open('prototype-v2-1-bw.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # The issue: the file has dangling paper-rows after the reader-view
    # Let's extract everything up to <!-- Home View -->
    head_match = re.search(r'(.*?<!-- Home View -->\s*<div id="home-view" class="view-container active">\s*<div class="home-watermark">What\'s on the menu today\?</div>\s*</div>)', content, re.DOTALL)
    
    head_html = head_match.group(1)

    # Let's extract the Bottom Search Island onwards
    bottom_match = re.search(r'(    <!-- Bottom Search Island -->.*)', content, re.DOTALL)
    bottom_html = bottom_match.group(1)

    # Rebuild the middle part
    middle_html = """

    <!-- Shelf View -->
    <div id="shelf-view" class="view-container">
        <div class="shelf-header">
            <h1 class="shelf-title">Paper Shelf</h1>
            <span style="color: var(--text-muted); font-size: 13px;">4 papers</span>
        </div>
        
        <div class="paper-list">
            <div class="paper-row">
                <div class="paper-main">
                    <div class="paper-title">Semantic Tube Prediction: Beating LLM Data Efficiency with JEPA</div>
                    <div class="paper-authors">Hai Huang, Yann LeCun, Randall Balestriero • 2026</div>
                </div>
                <div class="paper-status status-queued">Queued</div>
                <div class="paper-actions">
                    <button class="action-btn">Notes</button>
                    <button class="action-btn" style="color: #ef4444; border-color: #ef444420;">Delete</button>
                </div>
            </div>

            <div class="paper-row">
                <div class="paper-main">
                    <div class="paper-title">Duality Models: An Embarrassingly Simple One-step Generation Paradigm</div>
                    <div class="paper-authors">Peng Sun, Xinyi Shang, Tao Lin, Zhiqiang Shen • 2026</div>
                </div>
                <div class="paper-status status-reading">Reading</div>
                <div class="paper-actions">
                    <button class="action-btn">Notes</button>
                    <button class="action-btn" style="color: #ef4444; border-color: #ef444420;">Delete</button>
                </div>
            </div>

            <div class="paper-row">
                <div class="paper-main">
                    <div class="paper-title">SymTorch: A Framework for Symbolic Distillation of Deep Neural Networks</div>
                    <div class="paper-authors">Elizabeth S. Z. Tan, Adil Soubki, Miles Cranmer • 2026</div>
                </div>
                <div class="paper-status status-done">Done</div>
                <div class="paper-actions">
                    <button class="action-btn">Notes</button>
                    <button class="action-btn" style="color: #ef4444; border-color: #ef444420;">Delete</button>
                </div>
            </div>

            <div class="paper-row">
                <div class="paper-main">
                    <div class="paper-title">Reasoning Models Don't Always Say What They Think</div>
                    <div class="paper-authors">Yanda Chen, Joe Benton, Ansh Radhakrishnan... • 2025</div>
                </div>
                <div class="paper-status status-queued">Queued</div>
                <div class="paper-actions">
                    <button class="action-btn">Notes</button>
                    <button class="action-btn" style="color: #ef4444; border-color: #ef444420;">Delete</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Reader View -->
    <div id="reader-view" class="view-container">
        <div class="shelf-header" style="justify-content: center; border-bottom: none;">
            <h1 class="shelf-title">PDF Reader</h1>
        </div>
        <div style="max-width: 1000px; margin: 0 auto; height: 60vh; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
            Select a paper from the command menu to read.
        </div>
    </div>

"""

    with open('prototype-v2-1-bw.html', 'w', encoding='utf-8') as f:
        f.write(head_html + middle_html + bottom_html)


def fix_bw_iteration_1():
    with open('prototype-v2-1-bw-iteration-1.html', 'r', encoding='utf-8') as f:
        content = f.read()

    head_match = re.search(r'(.*<div id="home-view" class="view-container active">\s*<div class="home-watermark">\s*Curiosity is the <i>engine</i><br>of achievement.\s*</div>\s*</div>)', content, re.DOTALL)
    
    head_html = head_match.group(1)

    bottom_match = re.search(r'(    <div class="bottom-island-wrapper.*)', content, re.DOTALL)
    bottom_html = bottom_match.group(1)

    middle_html = """

    <!-- Shelf View -->
    <div id="shelf-view" class="view-container">
        <div class="shelf-header">
            <h1 class="shelf-title">Index.</h1>
            <span style="color: var(--text-muted); font-size: 14px;">4 items</span>
        </div>
        
        <div class="paper-list">
            <div class="paper-row">
                <div class="paper-title">Semantic Tube Prediction: Beating LLM Data Efficiency with JEPA</div>
                <div class="paper-meta-row">
                    <span class="paper-authors">Hai Huang, Yann LeCun, Randall Balestriero</span>
                    <span class="paper-status status-queued"><div class="status-dot"></div> Queued</span>
                </div>
                <div class="paper-actions">
                    <button class="action-btn" title="Open Notes">N</button>
                    <button class="action-btn" title="Delete">×</button>
                </div>
            </div>

            <div class="paper-row">
                <div class="paper-title">Duality Models: An Embarrassingly Simple One-step Generation Paradigm</div>
                <div class="paper-meta-row">
                    <span class="paper-authors">Peng Sun, Xinyi Shang, Tao Lin, Zhiqiang Shen</span>
                    <span class="paper-status status-reading"><div class="status-dot"></div> Reading</span>
                </div>
                <div class="paper-actions">
                    <button class="action-btn" title="Open Notes">N</button>
                    <button class="action-btn" title="Delete">×</button>
                </div>
            </div>

            <div class="paper-row">
                <div class="paper-title">SymTorch: A Framework for Symbolic Distillation of Deep Neural Networks</div>
                <div class="paper-meta-row">
                    <span class="paper-authors">Elizabeth S. Z. Tan, Adil Soubki, Miles Cranmer</span>
                    <span class="paper-status status-done"><div class="status-dot"></div> Done</span>
                </div>
                <div class="paper-actions">
                    <button class="action-btn" title="Open Notes">N</button>
                    <button class="action-btn" title="Delete">×</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Reader View -->
    <div id="reader-view" class="view-container">
        <div class="shelf-header" style="justify-content: center; border-bottom: none; margin-bottom: 24px;">
            <h1 class="shelf-title">PDF Reader</h1>
        </div>
        <div style="max-width: 1000px; margin: 0 auto; height: 60vh; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-family: 'Instrument Serif', serif; font-size: 24px;">
            Select a paper from the command menu to read.
        </div>
    </div>

"""

    with open('prototype-v2-1-bw-iteration-1.html', 'w', encoding='utf-8') as f:
        f.write(head_html + middle_html + bottom_html)


if __name__ == "__main__":
    fix_bw()
    fix_bw_iteration_1()

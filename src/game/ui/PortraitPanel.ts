import {
  PORTRAIT_ART,
  PORTRAIT_DETAIL_SIZE,
  PORTRAIT_EXPRESSIONS,
  PORTRAIT_EXPRESSION_SIZE,
  PORTRAIT_KINDS,
  PORTRAIT_LABELS,
  PORTRAIT_SHEET_WIDTH,
  type PortraitExpression,
  type PortraitKind,
} from '../portraits';

/**
 * Development-only inspector for the character portrait art.
 *
 * This is an asset viewer, NOT a game feature. The portraits have no gameplay
 * consumer yet: there is no dialogue system, no NPC to attach one to, and no
 * player portrait (the eight subjects are mall archetypes, and the protagonist
 * is Alex). Rather than invent a feature to justify the art, this exposes the
 * assets inside the real game so they can be judged at the size they would
 * actually be drawn — which is the thing a separate PNG viewer cannot tell you.
 *
 * It is gated behind the same dev flag as the debug bridge, and it creates its
 * own DOM and its own stylesheet instead of adding markup to `index.html` and
 * rules to `styles.css`. That keeps the shipped page and stylesheet free of
 * development-only surface: delete this file and its one call site and nothing
 * of it remains.
 *
 * Keys, chosen to avoid every key the game already uses (WASD / E / F / R /
 * Escape): `P` toggles, left/right arrows change character, up/down arrows
 * change expression. Movement keys are never consumed.
 */
const STYLE_ID = 'deadmall-portrait-panel-styles';

const PANEL_CSS = `
.dm-portraits {
  position: fixed; inset: auto 12px 12px auto; z-index: 40;
  display: none; gap: 12px; align-items: flex-end;
  padding: 10px 12px; border: 1px solid #4c4a56; border-radius: 6px;
  background: rgba(18,17,22,.94); color: #e8e6ef;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dm-portraits[data-open='true'] { display: flex; }
.dm-portraits img, .dm-portraits .frame {
  image-rendering: pixelated; image-rendering: crisp-edges;
  border: 1px solid #33313d; background: #0e0d12;
}
.dm-portraits .col { display: flex; flex-direction: column; gap: 4px; align-items: center; }
.dm-portraits .frame {
  width: ${PORTRAIT_EXPRESSION_SIZE * 2}px;
  height: ${PORTRAIT_EXPRESSION_SIZE * 2}px;
  background-repeat: no-repeat;
  background-size: ${PORTRAIT_SHEET_WIDTH * 2}px ${PORTRAIT_EXPRESSION_SIZE * 2}px;
}
.dm-portraits .cap { color: #9a95a8; letter-spacing: .06em; text-transform: uppercase; }
.dm-portraits .title { color: #c9a227; letter-spacing: .08em; text-transform: uppercase; }
.dm-portraits .hint { color: #6d687d; max-width: 20ch; }
`;

export class PortraitPanel {
  private readonly root: HTMLDivElement;
  private readonly portrait: HTMLImageElement;
  private readonly frame: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly expressionLabel: HTMLElement;
  /** -1 shows the detailed portrait only; 0..5 selects an expression frame. */
  private expressionIndex = 0;
  private kindIndex = 0;
  private open = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case 'p':
      case 'P':
        this.toggle();
        break;
      case 'ArrowLeft':
        this.stepKind(-1);
        break;
      case 'ArrowRight':
        this.stepKind(1);
        break;
      case 'ArrowUp':
        this.stepExpression(-1);
        break;
      case 'ArrowDown':
        this.stepExpression(1);
        break;
      default:
        return;
    }
    // Only reached for the keys above, so movement is never swallowed.
    event.preventDefault();
  };

  public constructor() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = PANEL_CSS;
      document.head.append(style);
    }

    this.root = document.createElement('div');
    this.root.className = 'dm-portraits';
    this.root.dataset.open = 'false';

    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = 'PORTRAITS // ASSET VIEWER';

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'P close · ←→ character · ↑↓ expression';

    const detailCol = document.createElement('div');
    detailCol.className = 'col';
    this.portrait = document.createElement('img');
    this.portrait.width = PORTRAIT_DETAIL_SIZE;
    this.portrait.height = PORTRAIT_DETAIL_SIZE;
    const detailCap = document.createElement('p');
    detailCap.className = 'cap';
    detailCap.textContent = `${PORTRAIT_DETAIL_SIZE}px detailed`;
    detailCol.append(this.portrait, detailCap);

    const exprCol = document.createElement('div');
    exprCol.className = 'col';
    this.frame = document.createElement('div');
    this.frame.className = 'frame';
    this.expressionLabel = document.createElement('p');
    this.expressionLabel.className = 'cap';
    exprCol.append(this.frame, this.expressionLabel);

    const textCol = document.createElement('div');
    this.title = document.createElement('p');
    this.title.className = 'cap';
    textCol.append(title, this.title, hint);

    this.root.append(textCol, detailCol, exprCol);
    document.body.append(this.root);

    window.addEventListener('keydown', this.onKeyDown);
    this.sync();
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  public toggle(): void {
    this.open = !this.open;
    this.root.dataset.open = String(this.open);
  }

  private stepKind(delta: number): void {
    const count = PORTRAIT_KINDS.length;
    this.kindIndex = (this.kindIndex + delta + count) % count;
    this.sync();
  }

  private stepExpression(delta: number): void {
    const count = PORTRAIT_EXPRESSIONS.length;
    this.expressionIndex = (this.expressionIndex + delta + count) % count;
    this.sync();
  }

  private sync(): void {
    const kind: PortraitKind | undefined = PORTRAIT_KINDS[this.kindIndex];
    const expression: PortraitExpression | undefined = PORTRAIT_EXPRESSIONS[this.expressionIndex];
    // Both indices are held in range by the steppers, so this is unreachable —
    // it exists only because indexed access is `| undefined` under
    // `noUncheckedIndexedAccess`, and narrowing beats asserting.
    if (!kind || !expression) return;
    const art = PORTRAIT_ART[kind];

    this.portrait.src = art.url;
    this.portrait.alt = `${PORTRAIT_LABELS[kind]} portrait`;
    this.title.textContent = `${this.kindIndex + 1}/${PORTRAIT_KINDS.length}  ${PORTRAIT_LABELS[kind]}`;

    // The six expressions are one sheet, so the frame is a background offset
    // rather than a separate request — the same reason the sheet exists.
    this.frame.style.backgroundImage = `url(${art.expressionUrl})`;
    this.frame.style.backgroundPosition =
      `-${this.expressionIndex * PORTRAIT_EXPRESSION_SIZE * 2}px 0`;
    this.expressionLabel.textContent = `${expression} (${PORTRAIT_EXPRESSION_SIZE}px)`;
  }
}

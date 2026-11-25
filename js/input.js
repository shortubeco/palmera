// Klavye + fare girişi
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();   // bu karede basılanlar
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false; this.clicked = false;
    this.locked = false;
    this.canvas = canvas;
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.locked && this.enabled) { try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* yok */ } }
        else { this.mouseDown = true; this.clicked = true; }
      }
      if (e.button === 2) this.dragging = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }
  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; this.clicked = false; }
}

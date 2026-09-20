import { Character } from '../core/Character';
import { audio } from '../core/AudioManager';
import { type MiniGame, type MiniGameHost, panel, label, bigButton } from './MiniGame';

// Ch 6: the nakalchi test. Player taps "Jump!", Betu jumps, monkeys copy
// after a beat. 3 rounds, then done. Tutorial for the ch7 hat throw.
export class CopycatDance implements MiniGame {
  constructor(private host: MiniGameHost) {}

  start(onDone: (r: { score: number }) => void): void {
    const { scene, overlay, dialogue } = this.host;
    const { cx, cy } = panel(this.host, 1040, 640);
    label(this.host, cx, cy - 265, dialogue.line('dance_instruction'), 32);

    const betu = new Character(scene, 'betu', 'stand', cx - 320, cy + 130, 270);
    overlay.add(betu.container);

    const monkeys = [0, 1, 2].map((i) => {
      const m = new Character(scene, 'monkey', 'sit', cx + 60 + i * 180, cy + 130, 220);
      overlay.add(m.container);
      return m;
    });

    let rounds = 0;
    let busy = false;
    const counter = label(this.host, cx, cy - 195, '', 30);

    bigButton(this.host, cx - 320, cy + 265, dialogue.line('dance_button'), () => {
      if (busy) return;
      busy = true;
      betu.play('jump');
      audio.boing();
      scene.time.delayedCall(650, () => {
        monkeys.forEach((m) => m.play('jump'));
        audio.giggle();
        rounds++;
        counter.setText(`${rounds} / 3`);
        scene.time.delayedCall(750, () => {
          betu.play('stand');
          monkeys.forEach((m) => m.play('sit'));
          if (rounds >= 3) {
            monkeys.forEach((m) => m.play('wave'));
            audio.fanfare();
            scene.time.delayedCall(1000, () => onDone({ score: rounds }));
          } else {
            busy = false;
          }
        });
      });
    });
  }
}

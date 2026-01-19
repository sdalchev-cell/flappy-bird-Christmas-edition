// Santa Flight - simple Phaser 3 Flappy Bird style game
// All game logic is in this one file (beginner-friendly and commented)

const GAME_WIDTH = 400;
const GAME_HEIGHT = 600;

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Load images that exist in the assets/ folder.
    // The workspace currently contains SVGs for Santa and the chimney; load those.
    // Try both PNG and SVG variants for a new player image; fall back to existing Santa files if needed.
    this.load.image('player_png', 'assets/player.png');
    this.load.image('player_svg', 'assets/player.svg');
    // still load santa variants as a fallback if the user didn't provide a new player image
    this.load.image('santa_png', 'assets/santa.png');
    this.load.image('santa_svg', 'assets/santa.svg');
    this.load.image('chimney', 'assets/chimney.svg');
    // Other images (background, presents) may be missing; we'll generate fallbacks later.
    // Optional SFX (place files in assets/ if available): flap, collect, death
    this.load.audio('sfx_flap', ['assets/flap.mp3', 'assets/flap.ogg']);
    this.load.audio('sfx_collect', ['assets/collect.mp3', 'assets/collect.ogg']);
    this.load.audio('sfx_death', ['assets/death.mp3', 'assets/death.ogg']);
  }

  create() {
    // Add a tiled background image if available, otherwise draw a simple night rectangle
    if (this.textures.exists('background')) {
      this.background = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'background').setOrigin(0);
    } else {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x081a2b).setOrigin(0);
      // subtle stars (light snow feel) - quick simple effect
      for (let i = 0; i < 40; i++) {
        const sx = Phaser.Math.Between(0, GAME_WIDTH);
        const sy = Phaser.Math.Between(0, GAME_HEIGHT);
        const s = this.add.circle(sx, sy, Phaser.Math.Between(1, 2), 0xffffff, 0.9);
        s.alpha = Phaser.Math.FloatBetween(0.4, 0.9);
      }
      this.background = null;
    }

    // Physics world bounds
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Create a generated fallback player (a sleigh-like silhouette) if no external player image provided
    const sg = this.add.graphics();
    sg.fillStyle(0x8b4513, 1);
    // sleigh body
    sg.fillRect(6, 18, 44, 18);
    // runner
    sg.fillStyle(0x222222, 1);
    sg.fillRect(4, 34, 48, 4);
    // sack (red) on sleigh
    sg.fillStyle(0xb22222, 1);
    sg.fillCircle(38, 18, 10);
    sg.generateTexture('player_gen', 56, 40);
    sg.destroy();

    // Choose the best available player texture: prefer new player SVG/PNG, then existing Santa, then generated
    const playerKeyCandidate = this.textures.exists('player_svg') ? 'player_svg' : (this.textures.exists('player_png') ? 'player_png' : (this.textures.exists('santa_svg') ? 'santa_svg' : (this.textures.exists('santa_png') ? 'santa_png' : 'player_gen')));
    // Alias chosen texture to canonical 'player' key for consistency
    try {
      const srcImg = this.textures.get(playerKeyCandidate).getSourceImage();
      if (srcImg) {
        const sw = srcImg.width || 56;
        const sh = srcImg.height || 40;
        const canvasTex = this.textures.createCanvas('player', sw, sh);
        canvasTex.context.drawImage(srcImg, 0, 0, sw, sh);
        canvasTex.refresh();
      }
    } catch (e) {
      // ignore aliasing errors
    }
    const playerKey = this.textures.exists('player') ? 'player' : playerKeyCandidate;
    this.player = this.physics.add.sprite(80, GAME_HEIGHT / 2, playerKey);
    this.player.setCollideWorldBounds(false);
    // Set a friendly display size and a tighter circular body for collision
    this.player.setDisplaySize(56, 56);
    this.player.setOrigin(0.5);
    this.player.setGravityY(800); // gravity applied to the player
    // Arcade body circle sized based on display size (better fit for the sprite)
    if (this.player.body && this.player.body.setCircle) {
      const radius = 18;
      const offsetX = Math.floor(this.player.displayWidth / 2) - radius;
      const offsetY = Math.floor(this.player.displayHeight / 2) - radius;
      this.player.body.setCircle(radius, offsetX, offsetY);
    } else {
      this.player.setCircle(18);
    }

    // Controls: SPACE to flap
    this.input.keyboard.on('keydown-SPACE', this.flap, this);

    // Groups for obstacles and collectibles
    this.pipes = this.physics.add.group();
    this.collectibles = this.physics.add.group();

    // Generate simple textures for presents / candy / gift if not provided
    // Present (red box with yellow ribbon)
    const g = this.add.graphics();
    g.fillStyle(0xd62828, 1);
    g.fillRect(0, 0, 32, 24);
    g.fillStyle(0xffd100, 1);
    g.fillRect(14, 0, 4, 24);
    g.fillRect(0, 10, 32, 4);
    g.generateTexture('present_gen', 32, 24);
    g.clear();

    // Candy (white rectangle with red stripes)
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 28, 14);
    g.fillStyle(0xd62828, 1);
    for (let i = 2; i < 28; i += 6) {
      g.fillRect(i, 0, 3, 14);
    }
    g.generateTexture('candy_gen', 28, 14);
    g.clear();

    // Gift (green box with ribbon)
    g.fillStyle(0x2a9d8f, 1);
    g.fillRect(0, 0, 36, 26);
    g.fillStyle(0xffd100, 1);
    g.fillRect(16, 0, 4, 26);
    g.fillRect(0, 10, 36, 4);
    g.generateTexture('gift_gen', 36, 26);
    g.clear();

    // High-resolution present graphic (clear texture for obstacles)
    const PW = 120;
    const PH = 90;
    g.fillStyle(0xd62828, 1);
    g.fillRect(0, 0, PW, PH);
    // ribbon vertical
    g.fillStyle(0xffd100, 1);
    g.fillRect(Math.floor(PW/2) - 6, 0, 12, PH);
    // ribbon horizontal
    g.fillRect(0, Math.floor(PH/2) - 6, PW, 12);
    // knot
    g.fillStyle(0xffb84d, 1);
    g.fillRect(Math.floor(PW/2) - 12, Math.floor(PH/2) - 12, 24, 24);
    // subtle highlight and border
    g.lineStyle(3, 0x6b0000, 0.6);
    g.strokeRect(1, 1, PW-2, PH-2);
    g.generateTexture('present_better', PW, PH);
    // fallback (smaller) present name
    g.generateTexture('present_gen', 32, 24);
    g.destroy();

    // Prepare sound objects or a lightweight WebAudio fallback.
    this.flapSound = null;
    this.collectSound = null;
    this.deathSound = null;
    try {
      if (this.cache && this.cache.audio && this.cache.audio.exists('sfx_flap')) {
        this.flapSound = this.sound.add('sfx_flap');
      }
      if (this.cache && this.cache.audio && this.cache.audio.exists('sfx_collect')) {
        this.collectSound = this.sound.add('sfx_collect');
      }
      if (this.cache && this.cache.audio && this.cache.audio.exists('sfx_death')) {
        this.deathSound = this.sound.add('sfx_death');
      }
    } catch (e) {
      // ignore
    }

    // Simple WebAudio fallback tone generator (uses user gesture to resume audio)
    this._audioCtx = null;
    this._makeTone = (freq, dur, vol = 0.06) => {
      try {
        if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this._audioCtx;
        const o = ctx.createOscillator();
        const g2 = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g2.gain.value = vol;
        o.connect(g2);
        g2.connect(ctx.destination);
        o.start();
        const now = ctx.currentTime;
        g2.gain.exponentialRampToValueAtTime(0.001, now + dur / 1000);
        setTimeout(() => { try { o.stop(); } catch (e) {} }, dur + 20);
      } catch (err) {
        // WebAudio unavailable
      }
    };

    // Timer to add pipes every 1500 ms
    this.pipeTimer = this.time.addEvent({ delay: 1500, callback: this.spawnPipes, callbackScope: this, loop: true });

    // Score
    this.score = 0;
    this.scoreText = this.add.text(12, 12, 'Score: 0', { fontSize: '22px', fill: '#ffffff' });

    // Game over flag
    this.isGameOver = false;

    // Collision detection between player and obstacles
    this.physics.add.overlap(this.player, this.pipes, this.onPlayerHit, null, this);
    // Collision detection between player and collectibles (presents)
    this.physics.add.overlap(this.player, this.collectibles, this.collectPresent, null, this);
  }

  flap() {
    if (this.isGameOver) {
      // Restart the scene on SPACE after game over
      this.scene.restart();
      return;
    }
    // Give the player an upward velocity
    this.player.setVelocityY(-320);
    // Play flap sound (prefer loaded audio, otherwise fallback tone)
    if (this.flapSound) {
      try { this.flapSound.play(); } catch (e) {}
    } else {
      this._makeTone(700, 90, 0.06);
    }
  }

  spawnPipes() {
    // Size of the gap for Santa to fly through
    const GAP_SIZE = 140;
    const minGapY = 80;
    const maxGapY = GAME_HEIGHT - 80 - GAP_SIZE;

    const gapY = Phaser.Math.Between(minGapY, maxGapY);
    const pipeX = GAME_WIDTH + 40; // spawn just off-screen

    // Use up to two obstacle variants: prefer external 'present' and 'chimney' if provided,
    // otherwise fall back to the generated 'present_better'.
    const obsChoices = [];
    if (this.textures.exists('present')) obsChoices.push('present');
    if (this.textures.exists('chimney')) obsChoices.push('chimney');
    if (obsChoices.length === 0) {
      obsChoices.push('present_better');
    }
    // Ensure we have at most two variants (already enforced above)
    const textureChoice = Phaser.Math.RND.pick(obsChoices);

    // Top obstacle
    const top = this.pipes.create(pipeX, gapY - GAP_SIZE / 2, textureChoice);
    top.setOrigin(0.5, 1); // anchor bottom
    top.setImmovable(true);
    top.body.allowGravity = false;
    top.setVelocityX(-160);
    top.setDisplaySize(84, 320);
    top.isTop = true;
    top.scored = false;

    // Bottom obstacle
    const bottom = this.pipes.create(pipeX, gapY + GAP_SIZE / 2, textureChoice);
    bottom.setOrigin(0.5, 0); // anchor top
    bottom.setImmovable(true);
    bottom.body.allowGravity = false;
    bottom.setVelocityX(-160);
    bottom.setDisplaySize(84, 320);
    bottom.isTop = false;
    bottom.scored = false;

    // Occasionally spawn a collectible (present) in the gap
    if (Phaser.Math.Between(0, 100) < 60) { // ~60% chance
      const presentKey = this.textures.exists('present') ? 'present' : (this.textures.exists('present_better') ? 'present_better' : 'present_gen');
      const present = this.collectibles.create(pipeX, gapY, presentKey);
      present.setOrigin(0.5);
      present.body.allowGravity = false;
      present.setVelocityX(-160);
      present.setDisplaySize(28, 28);
      present.collected = false;
    }
  }

  onPlayerHit() {
    if (this.isGameOver) return;
    this.endGame();
  }

  collectPresent(player, present) {
    if (present.collected) return;
    present.collected = true;
    // Hide and disable the physics body
    present.disableBody(true, true);
    // Small score bonus
    this.score += 5;
    this.scoreText.setText('Score: ' + this.score);
    // Play collect sound (prefer loaded audio, otherwise small melody)
    if (this.collectSound) {
      try { this.collectSound.play(); } catch (e) {}
    } else {
      this._makeTone(1000, 70, 0.06);
      setTimeout(() => this._makeTone(800, 70, 0.05), 80);
    }
  }

  endGame() {
    this.isGameOver = true;
    // Stop pipe movement and timer
    this.pipeTimer.remove(false);
    this.pipes.setVelocityX(0);
    this.collectibles.setVelocityX(0);
    this.player.setTint(0xff9999);
    this.player.setVelocity(0);

    // Play death sound (prefer loaded audio, otherwise low tone)
    if (this.deathSound) {
      try { this.deathSound.play(); } catch (e) {}
    } else {
      this._makeTone(220, 350, 0.08);
    }

    // Show Game Over and instruction
    const goText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'Game Over', { fontSize: '36px', fill: '#fff' });
    goText.setOrigin(0.5);
    const restartText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 'Press SPACE to restart', { fontSize: '18px', fill: '#fff' });
    restartText.setOrigin(0.5);
  }

  update(time, delta) {
    if (this.isGameOver) return;

    // Move the background slightly for parallax effect
    if (this.background) {
      this.background.tilePositionX += 0.2 * (delta / 16.666);
    }

    // Check leaving screen top/bottom
    if (this.player.y < -20 || this.player.y > GAME_HEIGHT + 20) {
      this.endGame();
      return;
    }

    // Rotate player a bit depending on velocity
    this.player.rotation = Phaser.Math.Clamp(this.player.body.velocity.y / 500, -0.5, 0.8);

    // Recycle pipes and handle scoring
    this.pipes.getChildren().forEach(pipe => {
      if (pipe.x < -120) {
        pipe.destroy();
      }
      // Score when top pipe (isTop) passes the player
      if (pipe.isTop && !pipe.scored && pipe.x + pipe.displayWidth / 2 < this.player.x) {
        pipe.scored = true;
        this.score += 1;
        this.scoreText.setText('Score: ' + this.score);
      }
    });

    // Recycle collectibles that left the screen
    this.collectibles.getChildren().forEach(item => {
      if (item.x < -60) item.destroy();
    });
  }
}

// Phaser game configuration
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [MainScene]
};

// Launch the game
const game = new Phaser.Game(config);

import * as PIXI from 'pixi.js'

/**
 * Petrify Filter (Medusa Style)
 * 
 * Implements a stone petrification effect with:
 * - Bottom-up spreading
 * - Stone tinting (#60656a)
 * - Procedural noise for roughness
 * - Grayscale conversion
 */
export class PetrifyFilter extends PIXI.Filter {
    constructor() {
        const vertexShader = `
      attribute vec2 aVertexPosition;
      attribute vec2 aTextureCoord;

      uniform mat3 projectionMatrix;

      varying vec2 vTextureCoord;

      void main(void) {
        gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
        vTextureCoord = aTextureCoord;
      }
    `

        const fragmentShader = `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      
      uniform float uProgress;    // 0.0 to 1.0
      uniform float uIntensity;   // Strength of the stone look
      uniform float uSeed;        // Random seed for noise
      
      // Constants
      const vec3 kStoneColor = vec3(0.376, 0.396, 0.416); // #60656a (Dark bluish gray)
      
      // Pseudo-random function
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      // Simple 2D noise
      float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      void main(void) {
        vec4 originalColor = texture2D(uSampler, vTextureCoord);
        
        // Skip transparent pixels
        if (originalColor.a < 0.01) {
          gl_FragColor = originalColor;
          return;
        }

        // 1. Calculate Grayscale
        float gray = dot(originalColor.rgb, vec3(0.299, 0.587, 0.114));
        
        // 2. Generate procedural noise for stone texture
        float n = noise(vTextureCoord * 10.0 + uSeed);
        float textureFactor = 0.8 + 0.4 * n; // Varies between 0.8 and 1.2
        
        // 3. Create Target Stone Color
        vec3 targetColor = vec3(gray) * kStoneColor * 1.5 * textureFactor;
        
        // 4. Calculate Spread Threshold (Bottom-up)
        // vTextureCoord.y goes from 0.0 (top) to 1.0 (bottom) in some systems, 
        // but typically in PIXI standard coords:
        // Let's assume standard UV: 0,0 top-left.
        // We want 1.0 (bottom) to 0.0 (top) spread.
        // Stone boundary moves from 1.0 up to 0.0 as uProgress goes 0 -> 1.
        
        float boundary = 1.0 - uProgress * 1.2; // Multiply by 1.2 to ensure it fully covers
        
        // Add some noise to the boundary edge
        float edgeNoise = noise(vTextureCoord * 20.0) * 0.05;
        float threshold = boundary + edgeNoise;
        
        // Mix factor: if y > threshold, we are stone.
        // Smoothstep for softer edge
        float mixFactor = smoothstep(threshold, threshold + 0.1, vTextureCoord.y);
        
        // Also apply global intensity
        mixFactor *= uIntensity;
        mixFactor = clamp(mixFactor, 0.0, 1.0);

        // 5. Final Mix
        vec3 finalRGB = mix(originalColor.rgb, targetColor, mixFactor);
        
        gl_FragColor = vec4(finalRGB, originalColor.a);
      }
    `

        super(vertexShader, fragmentShader, {
            uProgress: 0.0,
            uIntensity: 1.0,
            uSeed: Math.random()
        })
    }

    /**
     * 0.0 to 1.0
     * 0.0 = No effect
     * 1.0 = Fully petrified
     */
    get progress(): number {
        return this.uniforms['uProgress'] as number
    }

    set progress(value: number) {
        this.uniforms['uProgress'] = value
    }

    get intensity(): number {
        return this.uniforms['uIntensity'] as number
    }

    set intensity(value: number) {
        this.uniforms['uIntensity'] = value
    }

    get seed(): number {
        return this.uniforms['uSeed'] as number
    }

    set seed(value: number) {
        this.uniforms['uSeed'] = value
    }
}

/** Exact conversion constants */
const MI_TO_KM = 1.609344;

/**
 * Distance helper (stores miles internally).
 */
class Distance {
  /**
   * @param {object} [args]
   * @param {number} [args.miles=0]
   */
  constructor(args = {}) {
    this.miles = args.miles ?? 0;
    if (!Number.isFinite(this.miles)) {
      throw new TypeError("Distance must be a finite number.");
    }
  }

  /** Miles */
  get mi() {
    return this.miles;
  }

  /** Kilometers */
  get km() {
    return this.miles * MI_TO_KM;
  }

  /** Add another Distance (returns new instance) */
  add(other) {
    return new Distance({ miles: this.miles + other.miles });
  }

  /** Subtract another Distance (returns new instance) */
  sub(other) {
    return new Distance({ miles: this.miles - other.miles });
  }

  /** Scale by factor (returns new instance) */
  scale(factor) {
    return new Distance({ miles: this.miles * factor });
  }

  /** Format as string */
  toString(unit = "mi", digits = 2) {
    const val = unit === "km" ? this.km : this.mi;
    return `${val.toFixed(digits)} ${unit}`;
  }
}

/**
 * Speed helper (stores mph internally).
 */
class Speed {
  /**
   * Construct from distance and time in seconds.
   *
   * @param {object} args
   * @param {Distance} args.distance distance traveled
   * @param {number} args.seconds elapsed time in seconds (> 0)
   */
  constructor(args = {}) {
    const { distance, seconds } = args;

    if (!(distance instanceof Distance)) {
      throw new TypeError("distance must be a Distance instance.");
    }
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new TypeError("seconds must be a finite number > 0.");
    }

    this._mph = distance.mi / (seconds / 3600);
  }

  /** Miles per hour */
  get mph() {
    return this._mph;
  }

  /** Kilometers per hour */
  get kph() {
    return this._mph * MI_TO_KM;
  }

  /** Format as string */
  toString(unit = "mph", digits = 1) {
    const val = unit === "kph" ? this.kph : this.mph;
    return `${val.toFixed(digits)} ${unit}`;
  }
}

// --- Example usage ---

const d = new Distance({ miles: 3 });

// 3 miles in 30 minutes (1800 s) -> 6 mph
const s1 = new Speed({ distance: d, seconds: 1800 });
console.log(s1.mph); // 6
console.log(s1.kph); // 9.66 km/h approx

// Time to cover 10 miles at 6 mph -> 1.666... hours
console.log(s1.hoursToCover(new Distance({ miles: 10 }))); // ~1.67

import styles from './css.module.css';

const Component = () => {
  const name1 = `${styles.testClassName}`;
  const name2 = `foo ${styles.testClassName}`;
  const name3 = `${name1} foo ${styles.testClassName2} bar`;
  const name4 = `${styles.testClassName} bar ${name2}`;
  const name5 = `foo bar ${styles.testClassName} ${name1} ${styles.testClassName2} bar foo`;
  const name6 = `${Math.random() * Math.PI} ${styles.testClassName}`;
};

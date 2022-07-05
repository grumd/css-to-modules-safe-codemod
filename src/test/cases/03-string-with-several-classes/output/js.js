import styles from './css.module.css';

const Component1 = () => {
  return <div className={`test some-other foo-bar ${styles.testClassName} ${styles.testClassName2} one-more`}></div>;
};

const Component2 = () => {
  return <div className={`${styles.testClassName} ${styles.testClassName2} one-more`}></div>;
};

const Component3 = () => {
  return <div className={`foo bar ${styles.testClassName} ${styles.testClassName2}`}></div>;
};

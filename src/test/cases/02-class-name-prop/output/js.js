import styles from './css.module.css';

const Component1 = () => {
  return <div className={styles.testClassName}></div>;
};

const Component2 = () => {
  return <div className={`other-class ${styles.testClassName} other-class`}></div>;
};

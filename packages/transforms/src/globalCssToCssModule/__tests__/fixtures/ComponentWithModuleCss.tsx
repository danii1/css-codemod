// @ts-nocheck
import React from 'react'
import styles from './ComponentWithModuleCss.module.css'

export const ComponentWithModuleCss = () => {
    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Already using CSS modules</h1>
        </div>
    )
}

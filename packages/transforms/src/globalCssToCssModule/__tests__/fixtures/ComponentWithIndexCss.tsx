// @ts-nocheck
import React from 'react'
import './index.css'

export const ComponentWithIndexCss = () => {
    return (
        <div className="container">
            <h1 className="title">Component with index.css</h1>
            <p className="description">This component imports index.css instead of matching the component name</p>
        </div>
    )
}

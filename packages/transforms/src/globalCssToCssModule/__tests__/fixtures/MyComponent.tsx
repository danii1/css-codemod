// @ts-nocheck
import React from 'react'

export const MyComponent = () => {
    const isActive = true

    return (
        <div className="kek kek--wow">
            <div
                className={classNames(true ? 'kek' : false, {
                    kek: false,
                    'kek kek--wow': isActive,
                })}
            ></div>
            It's a component<p className="repo-header__logo">wow</p>
            <div className="repo-header">Another one!</div>
        </div>
    )
}

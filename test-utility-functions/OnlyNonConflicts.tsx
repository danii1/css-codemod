import React from 'react'
import classNames from 'classnames'
import clsx from 'clsx'
import { cn } from './utils'

export const OnlyNonConflicts: React.FC = () => {
    return (
        <div>
            {/* These should NOT be detected as conflicts for "Loading" */}
            <div className={classNames('Modal--Loading', 'active')}>classNames no conflict</div>
            <div className={cn('btn-Loading-state', 'disabled')}>cn no conflict</div>
            <div className={clsx('Loading-spinner', 'pending')}>clsx no conflict</div>
            <div className={classNames('pre-Loading-post')}>compound class name</div>
        </div>
    )
}

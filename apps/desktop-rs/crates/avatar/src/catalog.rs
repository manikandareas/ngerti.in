// Ported from packages/avatar/src/catalog.ts at 1d3feb2. Preserve catalog order.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    Circle,
    Oval,
    Squircle,
    Capsule,
    Triangle,
    Diamond,
    Pentagon,
    Hexagon,
}
impl Shape {
    pub const ALL: [Self; 8] = [
        Self::Circle,
        Self::Oval,
        Self::Squircle,
        Self::Capsule,
        Self::Triangle,
        Self::Diamond,
        Self::Pentagon,
        Self::Hexagon,
    ];
    pub fn path(self) -> &'static str {
        match self {
            Self::Circle => {
                "M169 99C172 137 143 166 104 169C64 173 32 145 31 106C29 69 54 36 94 32C132 27 166 57 169 99Z"
            }
            Self::Oval => {
                "M177 99C181 130 148 154 103 157C61 160 24 140 22 106C19 75 54 46 97 43C138 40 174 65 177 99Z"
            }
            Self::Squircle => {
                "M67 35L136 39Q164 41 162 69L166 130Q167 164 136 166L66 162Q35 161 36 130L32 66Q30 34 67 35Z"
            }
            Self::Capsule => {
                "M60 59L143 65C166 67 182 86 176 106C174 130 161 143 137 142L57 138C34 137 20 122 22 101C24 78 40 58 60 59Z"
            }
            Self::Triangle => "M92 34Q103 16 114 37L174 139Q187 163 161 166L39 162Q15 161 29 139Z",
            Self::Diamond => {
                "M87 29Q99 16 113 32L172 82Q189 96 175 111L117 171Q103 188 88 175L30 116Q13 102 27 87Z"
            }
            Self::Pentagon => {
                "M91 29Q102 23 112 32L170 75Q178 82 173 94L151 155Q147 168 135 165L63 169Q50 169 47 156L28 79Q25 70 32 66Z"
            }
            Self::Hexagon => {
                "M69 33L135 39Q143 39 149 49L176 94Q181 103 175 113L143 158Q137 168 126 165L62 161Q51 161 47 152L22 99Q17 89 27 80L57 40Q61 31 69 33Z"
            }
        }
    }
    pub fn face_y(self) -> f64 {
        match self {
            Self::Circle => 100.,
            Self::Oval => 97.,
            Self::Squircle => 100.,
            Self::Capsule => 95.,
            Self::Triangle => 119.,
            Self::Diamond => 100.,
            Self::Pentagon => 106.,
            Self::Hexagon => 100.,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Mint,
    Lilac,
    Peach,
    Sky,
    Butter,
    Rose,
    Tangerine,
    Iris,
    Matcha,
    Pearl,
    Seafoam,
    Aqua,
    Pistachio,
    Lemon,
    Melon,
    Blush,
    Wisteria,
    Lavender,
    Oat,
    Mist,
}
impl Color {
    pub const ALL: [Self; 20] = [
        Self::Mint,
        Self::Lilac,
        Self::Peach,
        Self::Sky,
        Self::Butter,
        Self::Rose,
        Self::Tangerine,
        Self::Iris,
        Self::Matcha,
        Self::Pearl,
        Self::Seafoam,
        Self::Aqua,
        Self::Pistachio,
        Self::Lemon,
        Self::Melon,
        Self::Blush,
        Self::Wisteria,
        Self::Lavender,
        Self::Oat,
        Self::Mist,
    ];
    pub const SELECTABLE: [Self; 14] = [
        Self::Mint,
        Self::Lilac,
        Self::Peach,
        Self::Sky,
        Self::Rose,
        Self::Iris,
        Self::Matcha,
        Self::Seafoam,
        Self::Aqua,
        Self::Melon,
        Self::Blush,
        Self::Wisteria,
        Self::Lavender,
        Self::Mist,
    ];
    pub fn palette(self) -> [&'static str; 3] {
        match self {
            Self::Mint => ["#9debc3", "#57d69f", "#25976f"],
            Self::Lilac => ["#d3a8f5", "#af77e4", "#7944b2"],
            Self::Peach => ["#ffc59b", "#ff9c73", "#d56a4c"],
            Self::Sky => ["#a1e1fc", "#64bdef", "#3289c1"],
            Self::Butter => ["#ffe997", "#f8cf49", "#c89724"],
            Self::Rose => ["#ffa8d4", "#ee78b0", "#bd447e"],
            Self::Tangerine => ["#ffc079", "#ff963f", "#d36628"],
            Self::Iris => ["#b0bdff", "#8498ef", "#5164bd"],
            Self::Matcha => ["#d3e989", "#accf57", "#779b2f"],
            Self::Pearl => ["#f8faff", "#cbd6e6", "#8f9fb5"],
            Self::Seafoam => ["#9aebd8", "#50cfb6", "#219681"],
            Self::Aqua => ["#9beaf1", "#52cfdf", "#259aa9"],
            Self::Pistachio => ["#dfef8b", "#bed856", "#8da334"],
            Self::Lemon => ["#fff68b", "#f2e34f", "#c4b42a"],
            Self::Melon => ["#ffb0a3", "#ff8279", "#d25151"],
            Self::Blush => ["#ffb3cf", "#f98fb8", "#cf5f91"],
            Self::Wisteria => ["#e8acf2", "#cf80e1", "#a049b6"],
            Self::Lavender => ["#c5b3ff", "#a28aea", "#7356bc"],
            Self::Oat => ["#f8d18a", "#e9b355", "#b9812c"],
            Self::Mist => ["#a0d5e8", "#6fb2ce", "#3b7f9e"],
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Face {
    Happy,
    Curious,
    Calm,
    Excited,
    Shy,
    Surprised,
    Sleepy,
    Focused,
}
impl Face {
    pub const ALL: [Self; 8] = [
        Self::Happy,
        Self::Curious,
        Self::Calm,
        Self::Excited,
        Self::Shy,
        Self::Surprised,
        Self::Sleepy,
        Self::Focused,
    ];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Idle,
    Listening,
    Thinking,
    Working,
    Celebrating,
    Sleeping,
    Error,
}
impl State {
    pub const ALL: [Self; 7] = [
        Self::Idle,
        Self::Listening,
        Self::Thinking,
        Self::Working,
        Self::Celebrating,
        Self::Sleeping,
        Self::Error,
    ];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Boop,
    Wave,
    Hop,
    Wiggle,
    Spin,
    Wink,
}
impl Action {
    pub const ALL: [Self; 6] = [
        Self::Boop,
        Self::Wave,
        Self::Hop,
        Self::Wiggle,
        Self::Spin,
        Self::Wink,
    ];
}
